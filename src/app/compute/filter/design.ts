/**
 * GPU-accelerated filter design for spectral filtering
 * 
 * Optimized for interactive filter exploration with point sources.
 * Uses delta function optimization (like heatTSL) for efficient computation:
 * - Forward transform is implicit: just sample psi[k, sourceVertex]
 * - Filter kernel applied in spectral domain
 * - Inverse transform reconstructs spatial field
 * 
 * This is the main filter design module for the compute/ system.
 * Always outputs GPU buffers for zero-copy integration with rendering.
 */

import {
  float,
  uint,
  storage,
  Fn,
  Loop,
  If,
  uniform,
} from 'three/tsl';
import { StorageBufferAttribute } from 'three/webgpu';
import type { FilterKernel } from './legacyTypes';
import { FilterParameters } from './kernels/design';

export interface FilterDesignConfig {
  /** Eigenvalues (K) */
  lambdas: Float32Array;
  
  /** Eigenfunctions (K × nV, row-major): psi[k,v] at index k*nV + v */
  psi: Float32Array;
  
  /** Mass matrix diagonal (nV) */
  mass: Float32Array;
}

/**
 * GPU-accelerated filter design with point-source optimization
 * 
 * Main filter design class for compute/ module.
 * Combines filter kernel design with efficient GPU computation.
 * Use this for interactive filter exploration on the manifold.
 */
export class FilterDesign {
  private nV: number; // Number of vertices
  private K: number;  // Number of eigenmodes

  // Storage buffers for spectral basis
  private lambdaAttr: StorageBufferAttribute;
  private lambdaStorage: any;
  private psiKVAttr: StorageBufferAttribute;  // TODO: Consider DataTexture for better caching
  private psiKVStorage: any;
  private massVAttr: StorageBufferAttribute;
  private massVStorage: any;

  // Storage buffers for computation
  private coeffAttr: StorageBufferAttribute;
  private coeffStorage: any;
  private filteredFieldAttr: StorageBufferAttribute;
  private filteredFieldStorage: any;

  // Filter kernel weights (pre-computed from FilterDesign)
  private filterWeightsAttr: StorageBufferAttribute;
  private filterWeightsStorage: any;

  // Uniforms
  private sourceVertexUniform: any;
  private KactiveUniform: any;

  // TSL compute functions
  private computeCoeffFn: any;
  private reconstructFieldFn: any;

  private initialized = false;
  private currentKernel: FilterKernel | null = null;

  constructor(config: FilterDesignTSLConfig) {
    const { lambdas, psi, mass } = config;

    this.K = lambdas.length;
    this.nV = mass.length;

    // Validate dimensions
    if (psi.length !== this.K * this.nV) {
      throw new Error(
        `Invalid psi dimensions: expected ${this.K * this.nV}, got ${psi.length}`
      );
    }
    this.initializeStorageBuffers(lambdas, psi, mass);
    this.createComputeFunctions();

    this.initialized = true;
  }

  /**
   * Initialize GPU storage buffers
   */
  private initializeStorageBuffers(
    lambdas: Float32Array,
    psi: Float32Array,
    mass: Float32Array
  ): void {
    // Eigenvalues
    this.lambdaAttr = new StorageBufferAttribute(lambdas, 1);
    this.lambdaStorage = storage(this.lambdaAttr, 'float', this.K);

    // Eigenfunctions (K × nV, row-major)
    // Note: For large K*nV, consider using DataTexture instead for better GPU cache behavior
    this.psiKVAttr = new StorageBufferAttribute(psi, 1);
    this.psiKVStorage = storage(this.psiKVAttr, 'float', psi.length);

    // Mass matrix diagonal
    this.massVAttr = new StorageBufferAttribute(mass, 1);
    this.massVStorage = storage(this.massVAttr, 'float', this.nV);

    // Spectral coefficients (K) - filtered directly
    this.coeffAttr = new StorageBufferAttribute(new Float32Array(this.K), 1);
    this.coeffStorage = storage(this.coeffAttr, 'float', this.K);

    // Output field (nV)
    this.filteredFieldAttr = new StorageBufferAttribute(new Float32Array(this.nV), 1);
    this.filteredFieldStorage = storage(this.filteredFieldAttr, 'float', this.nV);

    // Filter weights (K) - updated by applyFilter()
    this.filterWeightsAttr = new StorageBufferAttribute(new Float32Array(this.K).fill(1), 1);
    this.filterWeightsStorage = storage(this.filterWeightsAttr, 'float', this.K);

    // Uniforms
    this.sourceVertexUniform = uniform(0); // Default to vertex 0
    this.KactiveUniform = uniform(this.K);
  }

  /**
   * Create TSL compute functions
   */
  private createComputeFunctions(): void {
    const K = this.K;
    const nV = this.nV;

    // Stage 1: Compute filtered coefficients (forward transform + filter in one pass)
    // Optimized for point source: coeff[k] = weight[k] * psi[k, sourceVertex] * mass[sourceVertex]
    // One invocation per eigenmode: k = invocation index
    this.computeCoeffFn = Fn(() => {
      const k = uint().toVar();
      const s = uint(this.sourceVertexUniform).toVar();
      const K_val = uint(this.KactiveUniform).toVar();

      // Use compute invocation index (parallel: one k per invocation)
      k.assign(uint().toVar().assign(uint().computeIndex));

      // Early exit if beyond Kactive
      If(k.lessThan(K_val), () => {
        const mass_s = this.massVStorage.element(s);
        
        // psi[k, s] at index k*nV + s (K×nV row-major)
        const psi_idx = k.mul(uint(nV)).add(s);
        const psi_ks = this.psiKVStorage.element(psi_idx);
        
        // Apply filter weight
        const weight_k = this.filterWeightsStorage.element(k);
        
        // Combined forward transform + filtering
        const coeff_k = weight_k.mul(psi_ks).mul(mass_s);
        
        this.coeffStorage.element(k).assign(coeff_k);
      });
    }).setLayout({
      name: 'computeFilteredCoeff',
      type: 'void',
      inputs: []
    });

    // Stage 2: Inverse transform (reconstruction)
    // field[v] = Σₖ coeff[k] * psi[k,v]
    // One invocation per vertex: v = invocation index
    this.reconstructFieldFn = Fn(() => {
      const v = uint().toVar();
      const K_val = uint(this.KactiveUniform).toVar();

      // Use compute invocation index (parallel: one v per invocation)
      v.assign(uint().toVar().assign(uint().computeIndex));

      const sum = float(0.0).toVar();
      
      // Loop over active eigenmodes (this is the only loop, not nested)
      Loop({ start: uint(0), end: K_val, type: 'uint', condition: '<' }, ({ i: k }) => {
        const coeff_k = this.coeffStorage.element(k);
        
        // psi[k,v] at index k*nV + v (K×nV row-major)
        const psi_idx = k.mul(uint(nV)).add(v);
        const psi_kv = this.psiKVStorage.element(psi_idx);
        
        sum.assign(sum.add(coeff_k.mul(psi_kv)));
      });
      
      this.filteredFieldStorage.element(v).assign(sum);
    }).setLayout({
      name: 'reconstructField',
      type: 'void',
      inputs: []
    });
  }

  /**
   * Apply filter kernel to point source
   * Updates GPU filter weights from kernel parameters
   */
  applyFilter(kernel: FilterKernel, params: Record<string, number>, sourceVertex: number = 0): void {
    if (!this.initialized) {
      throw new Error('FilterDesign not initialized');
    }

    // Validate vertex index
    if (sourceVertex < 0 || sourceVertex >= this.nV) {
      throw new Error(`Invalid vertex index: ${sourceVertex} (must be 0 to ${this.nV - 1})`);
    }

    // Get eigenvalues for kernel evaluation
    const lambdas = new Float32Array(this.lambdaAttr.array);

    // Evaluate kernel at each eigenvalue
    const weights = new Float32Array(this.K);
    for (let i = 0; i < this.K; i++) {
      weights[i] = kernel.evaluate(lambdas[i], params);
    }

    // Count active eigenmodes (where |weight| > threshold)
    // Use absolute value to handle oscillatory/signed/band-pass kernels
    const activeThreshold = 0.01;
    let Kactive = this.K;
    for (let i = this.K - 1; i >= 0; i--) {
      if (Math.abs(weights[i]) > activeThreshold) {
        Kactive = i + 1;
        break;
      }
    }

    // Update filter weights on GPU
    this.filterWeightsAttr.array.set(weights);
    this.filterWeightsAttr.needsUpdate = true;

    // Update uniforms
    this.sourceVertexUniform.value = sourceVertex;
    this.KactiveUniform.value = Kactive;

    this.currentKernel = kernel;
  }

  /**
   * Update source vertex without recomputing filter
   * Useful for interactive exploration with same filter
   */
  setSourceVertex(vertexIdx: number): void {
    if (!this.initialized) {
      throw new Error('FilterDesign not initialized');
    }

    if (vertexIdx < 0 || vertexIdx >= this.nV) {
      throw new Error(`Invalid vertex index: ${vertexIdx} (must be 0 to ${this.nV - 1})`);
    }

    this.sourceVertexUniform.value = vertexIdx;
  }

  /**
   * Update number of active eigenmodes
   */
  setKactive(Kactive: number): void {
    if (!this.initialized) {
      throw new Error('FilterDesign not initialized');
    }

    if (Kactive <= 0 || Kactive > this.K) {
      throw new Error(`Invalid Kactive: ${Kactive} (must be 1 to ${this.K})`);
    }

    this.KactiveUniform.value = Kactive;
  }

  /**
   * Get compute nodes for render loop integration
   */
  getComputeNodes() {
    if (!this.initialized) {
      throw new Error('FilterDesign not initialized');
    }

    return {
      // Stage 1: Compute filtered coefficients (forward + filter)
      coeffCompute: this.computeCoeffFn().compute(this.K),

      // Stage 2: Reconstruct filtered field
      fieldCompute: this.reconstructFieldFn().compute(this.nV),
    };
  }

  /**
   * Get output field storage for visualization
   * This is the GPU buffer that can be bound to material colorNode
   */
  getOutputStorage() {
    if (!this.initialized) {
      throw new Error('FilterDesignTSL not initialized');
    }
    return this.filteredFieldStorage;
  }

  /**
   * Get current source vertex
   */
  getCurrentSourceVertex(): number {
    return this.sourceVertexUniform?.value ?? 0;
  }

  /**
   * Get current Kactive
   */
  getCurrentKactive(): number {
    return this.KactiveUniform?.value ?? this.K;
  }

  /**
   * Get current filter kernel
   */
  getCurrentKernel(): FilterKernel | null {
    return this.currentKernel;
  }

  /**
   * Read output field from GPU (for CPU processing/debugging)
   * 
   * WARNING: This triggers a GPU→CPU readback which is slow and blocks the pipeline.
   * Only use for debugging. For rendering, use getOutputStorage() directly.
   * 
   * Note: Three.js StorageBufferAttribute does not auto-sync GPU→CPU.
   * This currently returns the CPU-side array which may be stale.
   * For true GPU readback, you need explicit WebGPU buffer mapping.
   */
  readOutputField(): Float32Array {
    // TODO: Implement proper GPU→CPU readback via WebGPU buffer mapping
    // For now, return CPU array (stale unless Three.js syncs implicitly)
    return new Float32Array(this.filteredFieldAttr.array);
  }

  /**
   * Dispose GPU resources
   */
  dispose(): void {
    this.lambdaAttr?.dispose();
    this.psiKVAttr?.dispose();
    this.massVAttr?.dispose();
    this.coeffAttr?.dispose();
    this.filteredFieldAttr?.dispose();
    this.filterWeightsAttr?.dispose();

    this.initialized = false;
    this.currentKernel = null;
  }
}

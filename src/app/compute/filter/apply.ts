/**
 * Spectral filter application using Three.js TSL
 * 
 * GPU-accelerated filter application on scalar fields using spectral basis.
 * Performs three-stage computation:
 * 1. Forward transform: field → spectral coefficients
 * 2. Kernel application: multiply coefficients by filter weights
 * 3. Inverse transform: filtered coefficients → filtered field
 */

import {
  float,
  vec2,
  storage,
  Fn,
  Loop,
  uniform,
} from 'three/tsl';
import { StorageBufferAttribute } from 'three/webgpu';
import type { FilterParameters } from './kernels/design';
import type { Field } from '@/app/manifold/field/Field';

export interface SpectralFilterTSLConfig {
  /** Eigenvalues (K) */
  lambdas: Float32Array;
  
  /** Eigenvectors (K × nV, row-major) */
  psi: Float32Array;
  
  /** Mass matrix diagonal (nV) */
  mass: Float32Array;
}

/**
 * GPU-accelerated spectral filter application
 */
export class SpectralFilterTSL {
  private nV: number; // Number of vertices
  private K: number;  // Number of eigenmodes

  // Storage buffers for spectral basis
  private psiKVAttr: StorageInstancedBufferAttribute;
  private psiKVStorage: any;
  private massVAttr: StorageBufferAttribute;
  private massVStorage: any;

  // Storage buffers for computation
  private coeffAttr: StorageBufferAttribute;
  private coeffStorage: any;
  private filteredCoeffAttr: StorageBufferAttribute;
  private filteredCoeffStorage: any;
  private outputFieldAttr: StorageBufferAttribute;
  private outputFieldStorage: any;

  // Filter weights (updated per filter design)
  private filterWeightsAttr: StorageBufferAttribute;
  private filterWeightsStorage: any;

  // Uniforms
  private KactiveUniform: any;

  // TSL compute functions
  private forwardTransformFn: any;
  private applyKernelFn: any;
  private inverseTransformFn: any;

  private initialized = false;

  constructor(config: SpectralFilterTSLConfig) {
    const { lambdas, psi, mass } = config;

    this.K = lambdas.length;
    this.nV = mass.length;

    // Validate dimensions
    if (psi.length !== this.K * this.nV) {
      throw new Error(
        `Invalid psi dimensions: expected ${this.K * this.nV}, got ${psi.length}`
      );
    }
    this.initializeStorageBuffers(psi, mass);
    this.createComputeFunctions();

    this.initialized = true;
  }

  /**
   * Initialize GPU storage buffers
   */
  private initializeStorageBuffers(psi: Float32Array, mass: Float32Array): void {
    // Eigenvectors (K × nV, row-major)
    this.psiKVAttr = new StorageInstancedBufferAttribute(psi, 1);
    this.psiKVStorage = storage(this.psiKVAttr, 'float', psi.length);

    // Mass matrix diagonal
    this.massVAttr = new StorageBufferAttribute(mass, 1);
    this.massVStorage = storage(this.massVAttr, 'float', this.nV);

    // Spectral coefficients (K)
    this.coeffAttr = new StorageBufferAttribute(new Float32Array(this.K), 1);
    this.coeffStorage = storage(this.coeffAttr, 'float', this.K);

    // Filtered coefficients (K)
    this.filteredCoeffAttr = new StorageBufferAttribute(new Float32Array(this.K), 1);
    this.filteredCoeffStorage = storage(this.filteredCoeffAttr, 'float', this.K);

    // Output field (nV)
    this.outputFieldAttr = new StorageBufferAttribute(new Float32Array(this.nV), 1);
    this.outputFieldStorage = storage(this.outputFieldAttr, 'float', this.nV);

    // Filter weights (K) - initialized to ones, updated by setFilter()
    this.filterWeightsAttr = new StorageBufferAttribute(new Float32Array(this.K).fill(1), 1);
    this.filterWeightsStorage = storage(this.filterWeightsAttr, 'float', this.K);

    // Uniforms
    this.KactiveUniform = uniform(this.K);
  }

  /**
   * Create TSL compute functions
   */
  private createComputeFunctions(): void {
    const nV = this.nV;
    const K = this.K;

    // Forward transform: project input field onto eigenmodes
    // coeff[k] = Σᵥ psi[k,v] * field[v] * mass[v]
    this.forwardTransformFn = Fn(() => {
      const inputFieldStorage = this.outputFieldStorage; // Input is stored in output buffer initially

      Loop(this.KactiveUniform, ({ i: k }) => {
        const sum = float(0).toVar();

        Loop(nV, ({ i: v }) => {
          const psi_kv = this.psiKVStorage.element(k.mul(nV).add(v));
          const field_v = inputFieldStorage.element(v);
          const mass_v = this.massVStorage.element(v);

          sum.assign(sum.add(psi_kv.mul(field_v).mul(mass_v)));
        });

        this.coeffStorage.element(k).assign(sum);
      });
    }).setLayout({
      name: 'forwardTransform',
      type: 'void',
      inputs: [],
    });

    // Apply kernel: multiply coefficients by filter weights
    // filteredCoeff[k] = coeff[k] * weight[k]
    this.applyKernelFn = Fn(() => {
      Loop(this.KactiveUniform, ({ i: k }) => {
        const coeff_k = this.coeffStorage.element(k);
        const weight_k = this.filterWeightsStorage.element(k);

        this.filteredCoeffStorage.element(k).assign(coeff_k.mul(weight_k));
      });
    }).setLayout({
      name: 'applyKernel',
      type: 'void',
      inputs: [],
    });

    // Inverse transform: reconstruct filtered field from coefficients
    // field[v] = Σₖ filteredCoeff[k] * psi[k,v]
    this.inverseTransformFn = Fn(() => {
      Loop(nV, ({ i: v }) => {
        const sum = float(0).toVar();

        Loop(this.KactiveUniform, ({ i: k }) => {
          const filteredCoeff_k = this.filteredCoeffStorage.element(k);
          const psi_kv = this.psiKVStorage.element(k.mul(nV).add(v));

          sum.assign(sum.add(filteredCoeff_k.mul(psi_kv)));
        });

        this.outputFieldStorage.element(v).assign(sum);
      });
    }).setLayout({
      name: 'inverseTransform',
      type: 'void',
      inputs: [],
    });
  }

  /**
   * Set filter design (updates GPU filter weights)
   */
  setFilter(filterParams: FilterParameters, lambdas: Float32Array): void {
    if (!this.initialized) {
      throw new Error('SpectralFilterTSL not initialized');
    }

    // Generate GPU kernel from parameters
    const gpuKernel = filterParams.toGPUKernel(lambdas);

    // Update filter weights on GPU
    this.filterWeightsAttr.array.set(gpuKernel.weights);
    this.filterWeightsAttr.needsUpdate = true;

    // Update Kactive uniform
    this.KactiveUniform.value = gpuKernel.Kactive;
  }

  /**
   * Apply filter to input field (synchronous, returns output field)
   */
  applyFilter(inputField: Field, filterParams: FilterParameters, lambdas: Float32Array): Field {
    if (!this.initialized) {
      throw new Error('SpectralFilterTSL not initialized');
    }

    // Update filter weights
    this.setFilter(filterParams, lambdas);

    // Load input field into output buffer (will be overwritten)
    const inputData = inputField.getStorageArray();
    this.outputFieldAttr.array.set(inputData);
    this.outputFieldAttr.needsUpdate = true;

    // Dispatch compute pipeline (this will happen in render loop)
    // For now, we return a Field object that references the output storage
    // The actual computation happens when compute nodes are executed

    // Create output field
    const outputField = new Field(
      `${inputField.name}_filtered`,
      inputField.attributeName,
      inputField.manifold
    );

    // Note: In actual usage, compute nodes need to be executed before reading output
    // This is typically done in the render loop via getComputeNodes()

    return outputField;
  }

  /**
   * Get compute nodes for integration into render loop
   */
  getComputeNodes() {
    if (!this.initialized) {
      throw new Error('SpectralFilterTSL not initialized');
    }

    return {
      // Stage 1: Project field onto eigenmodes
      forwardTransform: this.forwardTransformFn().compute(this.K),

      // Stage 2: Apply filter kernel
      applyKernel: this.applyKernelFn().compute(this.K),

      // Stage 3: Reconstruct filtered field
      inverseTransform: this.inverseTransformFn().compute(this.nV),
    };
  }

  /**
   * Get output field storage for binding to material
   */
  getOutputFieldStorage() {
    if (!this.initialized) {
      throw new Error('SpectralFilterTSL not initialized');
    }
    return this.outputFieldStorage;
  }

  /**
   * Load input field data into GPU buffer
   */
  loadInputField(field: Field): void {
    const data = field.getStorageArray();
    if (data.length !== this.nV) {
      throw new Error(`Field size mismatch: expected ${this.nV}, got ${data.length}`);
    }

    this.outputFieldAttr.array.set(data);
    this.outputFieldAttr.needsUpdate = true;
  }

  /**
   * Read output field data from GPU (for CPU processing)
   */
  readOutputField(): Float32Array {
    // Note: In WebGPU, reading back from GPU is async
    // This is a synchronous accessor to the underlying buffer
    return new Float32Array(this.outputFieldAttr.array);
  }

  /**
   * Dispose GPU resources
   */
  dispose(): void {
    this.psiKVAttr?.dispose();
    this.massVAttr?.dispose();
    this.coeffAttr?.dispose();
    this.filteredCoeffAttr?.dispose();
    this.outputFieldAttr?.dispose();
    this.filterWeightsAttr?.dispose();

    this.initialized = false;
  }
}

/**
 * Eigenmode Visualizer using TSL Compute
 * 
 * Renders a single eigenmode as a colormap on the mesh using GPU compute.
 * Uses GPUResourceManager for storage buffer lifecycle management.
 * 
 * Pipeline:
 * 1. Load eigenmodes from zarr (eigenvalues, eigenvectors)
 * 2. Optionally load mass matrix for proper L² reconstruction
 * 3. Upload to GPU via GPUResourceManager storage buffers
 * 4. Compute shader: Inverse transform ψ_k(v) → field values
 * 5. Bind to material: field → colormap
 */

import type { Manifold } from '../../manifold/Manifold';
import type { GPUResourceManager } from '../../gpu/GPUResourceManager';
import type { ZarrOperator } from '../../io/loaders/zarr';

export interface EigenmodeVisualizerParams {
  modeIndex: number;      // Which eigenmode to visualize (0-based)
  amplitude: number;      // Amplitude multiplier (default: 1.0)
  useMassMatrix: boolean; // Whether to use mass matrix weighting
}

/**
 * Eigenmode Visualizer using Three.js TSL
 */
export class EigenmodeVisualizer {
  private initialized = false;

  // Data dimensions
  private nV = 0;
  private K = 0;

  // Storage buffer keys (managed by GPUResourceManager)
  private eigenvaluesKey = '';
  private eigenvectorsKey = '';
  private massKey = '';
  private fieldOutputKey = '';

  // GPU resource manager
  private gpuManager: GPUResourceManager;

  // Three.js imports (loaded dynamically)
  private THREE: any = null;
  private TSL: any = null;

  // TSL compute function
  private reconstructModeFn: any = null;

  // Uniforms
  private modeIndexUniform: any = null;
  private amplitudeUniform: any = null;
  private useMassUniform: any = null;

  constructor(gpuManager: GPUResourceManager) {
    this.gpuManager = gpuManager;
  }

  /**
   * Initialize visualizer with eigenmodes data
   * @param manifold Manifold with eigenmodes
   * @param massOperator Optional mass matrix operator (for weighted reconstruction)
   */
  async initialize(
    manifold: Manifold,
    massOperator?: ZarrOperator
  ): Promise<void> {
    if (this.initialized) {
      return;
    }
    // Validate manifold has eigenmodes
    if (!manifold.eigenmodes) {
      throw new Error('Manifold does not have eigenmodes');
    }

    const { eigenvalues, eigenvectors } = manifold.eigenmodes;
    this.nV = manifold.nV;
    this.K = eigenvalues.length;
    // Dynamically import Three.js WebGPU and TSL
    this.THREE = await import('three/webgpu');
    this.TSL = await import('three/tsl');

    // Generate unique storage buffer keys
    const manifoldId = manifold.metadata.id;
    this.eigenvaluesKey = `eigenmode-vis/${manifoldId}/eigenvalues`;
    this.eigenvectorsKey = `eigenmode-vis/${manifoldId}/eigenvectors`;
    this.massKey = `eigenmode-vis/${manifoldId}/mass`;
    this.fieldOutputKey = `eigenmode-vis/${manifoldId}/field-output`;

    // Register storage buffers in GPUResourceManager
    const buffers = new Map<string, any>();

    // Eigenvalues: [K, 1] or [K] → Float32Array
    const eigenvaluesF32 = eigenvalues instanceof Float32Array 
      ? eigenvalues 
      : new Float32Array(eigenvalues);
    buffers.set(this.eigenvaluesKey, {
      data: eigenvaluesF32,
      itemSize: 1,
      options: { retainCpu: true, metadata: { name: 'eigenvalues', K: this.K } }
    });

    // Eigenvectors: [nV, K] column-major → need to transpose to [K, nV] row-major for GPU
    const eigenvectorsRowMajor = new Float32Array(this.K * this.nV);
    for (let k = 0; k < this.K; k++) {
      for (let v = 0; v < this.nV; v++) {
        // Source: column-major [nV, K] → eigenvectors[v + nV*k]
        // Target: row-major [K, nV] → eigenvectorsRowMajor[k + K*v]
        const srcIdx = v + this.nV * k;
        const dstIdx = k + this.K * v;
        eigenvectorsRowMajor[dstIdx] = eigenvectors instanceof Float32Array
          ? eigenvectors[srcIdx]
          : eigenvectors[srcIdx];
      }
    }
    buffers.set(this.eigenvectorsKey, {
      data: eigenvectorsRowMajor,
      itemSize: 1,
      options: { retainCpu: true, metadata: { name: 'eigenvectors', shape: [this.K, this.nV] } }
    });

    // Mass matrix (optional): Diagonal [nV] or extract from COO
    if (massOperator) {
      let massDiagonal: Float32Array;
      
      if (massOperator.format === 'diagonal' && massOperator.diagonal) {
        massDiagonal = massOperator.diagonal instanceof Float32Array
          ? massOperator.diagonal
          : new Float32Array(massOperator.diagonal);
      } else if (massOperator.format === 'coo') {
        // Extract diagonal from COO
        massDiagonal = new Float32Array(this.nV);
        for (let i = 0; i < massOperator.row!.length; i++) {
          const r = massOperator.row![i];
          const c = massOperator.col![i];
          if (r === c) {
            massDiagonal[r] = massOperator.data[i];
          }
        }
      } else {
        throw new Error(`Unsupported mass matrix format: ${massOperator.format}`);
      }

      buffers.set(this.massKey, {
        data: massDiagonal,
        itemSize: 1,
        options: { retainCpu: true, metadata: { name: 'mass', nV: this.nV } }
      });
    } else {
      // No mass matrix: use uniform weights (all 1s)
      const uniformMass = new Float32Array(this.nV).fill(1.0);
      buffers.set(this.massKey, {
        data: uniformMass,
        itemSize: 1,
        options: { retainCpu: false, metadata: { name: 'mass-uniform', nV: this.nV } }
      });
    }

    // Output field buffer: [nV] (zeros)
    buffers.set(this.fieldOutputKey, {
      data: new Float32Array(this.nV),
      itemSize: 1,
      options: { retainCpu: false, metadata: { name: 'field-output', nV: this.nV } }
    });

    // Bulk register all buffers
    this.gpuManager.registerStorageBuffers(buffers);

    // Create TSL storage nodes
    const { storage, uniform, Fn, float, uint } = this.TSL;

    const eigenvaluesStorage = storage(
      this.gpuManager.getStorageBuffer(this.eigenvaluesKey)!.bufferAttribute,
      'float',
      this.K
    );

    const eigenvectorsStorage = storage(
      this.gpuManager.getStorageBuffer(this.eigenvectorsKey)!.bufferAttribute,
      'float',
      this.K * this.nV
    );

    const massStorage = storage(
      this.gpuManager.getStorageBuffer(this.massKey)!.bufferAttribute,
      'float',
      this.nV
    );

    const fieldOutputStorage = storage(
      this.gpuManager.getStorageBuffer(this.fieldOutputKey)!.bufferAttribute,
      'float',
      this.nV
    );

    // Create uniforms
    this.modeIndexUniform = uniform(0);      // Which mode to visualize
    this.amplitudeUniform = uniform(1.0);    // Amplitude multiplier
    this.useMassUniform = uniform(0);        // 0 = no mass, 1 = use mass

    // TSL compute function: Reconstruct single eigenmode
    // field[v] = amplitude * ψ_k(v) * (useMass ? mass[v] : 1.0)
    this.reconstructModeFn = Fn(() => {
      const { computeIndex } = this.TSL;
      const v = computeIndex.toVar();
      const k = uint(this.modeIndexUniform).toVar();
      const amp = float(this.amplitudeUniform).toVar();
      const useMass = float(this.useMassUniform).toVar();

      // Access eigenfunction: ψ[k + K*v] (row-major layout)
      const psi_idx = k.add(uint(this.K).mul(v));
      const psi_kv = eigenvectorsStorage.element(psi_idx);

      // Optional mass weighting
      const mass_v = massStorage.element(v);
      const weight = this.TSL.mix(float(1.0), mass_v, useMass);

      // Compute field value
      const fieldValue = amp.mul(psi_kv).mul(weight);
      
      fieldOutputStorage.element(v).assign(fieldValue);
    }).setLayout({
      name: 'reconstructMode',
      type: 'void',
      inputs: []
    });

    this.initialized = true;
  }

  /**
   * Get compute node for integration into render loop
   */
  getComputeNode() {
    if (!this.initialized) {
      throw new Error('EigenmodeVisualizer not initialized');
    }

    return this.reconstructModeFn().compute(this.nV);
  }

  /**
   * Get field output storage for binding to material
   */
  getFieldStorage() {
    if (!this.initialized) {
      throw new Error('EigenmodeVisualizer not initialized');
    }

    const descriptor = this.gpuManager.getStorageBuffer(this.fieldOutputKey);
    if (!descriptor) {
      throw new Error('Field output storage buffer not found');
    }

    // Return TSL storage node
    const { storage } = this.TSL;
    return storage(descriptor.bufferAttribute, 'float', this.nV);
  }

  /**
   * Update visualization parameters
   */
  setParams(params: Partial<EigenmodeVisualizerParams>): void {
    if (!this.initialized) {
      throw new Error('EigenmodeVisualizer not initialized');
    }

    if (params.modeIndex !== undefined) {
      if (params.modeIndex < 0 || params.modeIndex >= this.K) {
        throw new Error(`Invalid mode index: ${params.modeIndex} (must be 0 to ${this.K - 1})`);
      }
      this.modeIndexUniform.value = params.modeIndex;
    }

    if (params.amplitude !== undefined) {
      this.amplitudeUniform.value = params.amplitude;
    }

    if (params.useMassMatrix !== undefined) {
      this.useMassUniform.value = params.useMassMatrix ? 1 : 0;
    }
  }

  /**
   * Get current parameters
   */
  getParams(): EigenmodeVisualizerParams {
    return {
      modeIndex: this.modeIndexUniform?.value ?? 0,
      amplitude: this.amplitudeUniform?.value ?? 1.0,
      useMassMatrix: (this.useMassUniform?.value ?? 0) > 0
    };
  }

  /**
   * Get data dimensions
   */
  getDimensions(): { nV: number; K: number } {
    return { nV: this.nV, K: this.K };
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    // Release storage buffers from GPUResourceManager
    if (this.eigenvaluesKey) this.gpuManager.releaseStorageBuffer(this.eigenvaluesKey);
    if (this.eigenvectorsKey) this.gpuManager.releaseStorageBuffer(this.eigenvectorsKey);
    if (this.massKey) this.gpuManager.releaseStorageBuffer(this.massKey);
    if (this.fieldOutputKey) this.gpuManager.releaseStorageBuffer(this.fieldOutputKey);

    this.initialized = false;
  }
}

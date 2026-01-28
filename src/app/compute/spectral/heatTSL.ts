/**
 * Heat Kernel Localization using Three.js TSL (Three Shading Language)
 * 
 * Computes localized heat field at a selected vertex using spectral decomposition:
 * 1. Forward transform: Project delta function to eigenmode coefficients
 * 2. Apply heat filter: exp(-λ * τ) 
 * 3. Inverse transform: Reconstruct filtered field on vertices
 * 
 * Uses Three.js WebGPU renderer with TSL compute nodes for zero-copy GPU pipeline.
 */

import type { BCTSpectralData } from '../../io/loaders/types';

export interface HeatKernelTSLParams {
  selectedVertex: number;  // 0-based vertex index
  tau: number;            // Heat diffusion time parameter
  Kactive: number;        // Number of active eigenmodes (≤ K)
}

/**
 * Three.js TSL Heat Kernel Compute Node System
 */
export class HeatKernelTSL {
  private initialized = false;

  // Storage buffer attributes (Three.js managed)
  private lambdaAttr: any = null;
  private psiKVAttr: any = null;
  private massVAttr: any = null;
  private coeffAttr: any = null;
  private heatFieldAttr: any = null;

  // Storage nodes (TSL)
  private lambdaStorage: any = null;
  private psiKVStorage: any = null;
  private massVStorage: any = null;
  private coeffStorage: any = null;
  private heatFieldStorage: any = null;

  // Compute functions (TSL Fn)
  private computeCoeffFn: any = null;
  private reconstructFieldFn: any = null;

  // Uniforms (TSL)
  private sourceVertexUniform: any = null;
  private tauUniform: any = null;
  private KactiveUniform: any = null;

  // Data dimensions
  private nV = 0;
  private K = 0;

  // Three.js imports (loaded dynamically)
  private THREE: any = null;
  private TSL: any = null;

  constructor() {}

  /**
   * Initialize TSL heat kernel system
   * @param bctData Spectral data from BCT package
   */
  async initialize(bctData: BCTSpectralData): Promise<void> {
    if (this.initialized) {
      return;
    }
    // Dynamically import Three.js WebGPU and TSL
    this.THREE = await import('three/webgpu');
    this.TSL = await import('three/tsl');

    const { lambda, psi, massV, nV, K } = bctData;
    this.nV = nV;
    this.K = K;
    // Create storage buffer attributes (GPU-resident)
    this.lambdaAttr = new this.THREE.StorageBufferAttribute(lambda, 1);
    this.psiKVAttr = new this.THREE.StorageBufferAttribute(psi, 1);
    this.massVAttr = new this.THREE.StorageBufferAttribute(massV, 1);
    this.coeffAttr = new this.THREE.StorageBufferAttribute(new Float32Array(K), 1);
    this.heatFieldAttr = new this.THREE.StorageBufferAttribute(new Float32Array(nV), 1);

    // Create storage nodes
    const { storage, uniform, Fn, float, uint, Loop } = this.TSL;

    this.lambdaStorage = storage(this.lambdaAttr, 'float', K);
    this.psiKVStorage = storage(this.psiKVAttr, 'float', K * nV); // Row-major K×nV
    this.massVStorage = storage(this.massVAttr, 'float', nV);
    this.coeffStorage = storage(this.coeffAttr, 'float', K);
    this.heatFieldStorage = storage(this.heatFieldAttr, 'float', nV);

    // Create uniforms
    this.sourceVertexUniform = uniform(0); // uint in shader
    this.tauUniform = uniform(0.1);
    this.KactiveUniform = uniform(K);

    // TSL compute function: Forward transform + heat filter
    // coeff[k] = exp(-lambda[k] * tau) * psi[k, sourceVertex] * mass[sourceVertex]
    this.computeCoeffFn = Fn(() => {
      const { computeIndex } = this.TSL;
      const k = computeIndex.toVar();
      const s = uint(this.sourceVertexUniform).toVar();
      const K_val = uint(this.KactiveUniform).toVar();

      // Early exit if beyond Kactive
      const shouldCompute = k.lessThan(K_val);
      
      this.TSL.If(shouldCompute, () => {
        const lambda_k = this.lambdaStorage.element(k);
        const mass_s = this.massVStorage.element(s);
        
        // psi_k(s) = psi[k + K*s] (row-major layout)
        const psi_idx = k.add(uint(K).mul(s));
        const psi_ks = this.psiKVStorage.element(psi_idx);
        
        // Apply heat filter
        const tau_val = float(this.tauUniform);
        const coeff_k = this.TSL.exp(lambda_k.mul(tau_val).negate()).mul(psi_ks).mul(mass_s);
        
        this.coeffStorage.element(k).assign(coeff_k);
      });
    }).setLayout({
      name: 'computeCoeff',
      type: 'void',
      inputs: []
    });

    // TSL compute function: Inverse transform (reconstruction)
    // H(v) = sum_k coeff[k] * psi[k, v]
    this.reconstructFieldFn = Fn(() => {
      const { computeIndex } = this.TSL;
      const v = computeIndex.toVar();
      const K_val = uint(this.KactiveUniform).toVar();

      let sum = float(0.0).toVar();
      
      // Loop over active eigenmodes
      Loop({ start: uint(0), end: K_val, type: 'uint', condition: '<' }, ({ i }: any) => {
        const coeff_i = this.coeffStorage.element(i);
        
        // psi_i(v) = psi[i + K*v] (row-major layout)
        const psi_idx = i.add(uint(K).mul(v));
        const psi_iv = this.psiKVStorage.element(psi_idx);
        
        sum.assign(sum.add(coeff_i.mul(psi_iv)));
      });
      
      this.heatFieldStorage.element(v).assign(sum);
    }).setLayout({
      name: 'reconstructField',
      type: 'void',
      inputs: []
    });

    this.initialized = true;
  }

  /**
   * Get compute nodes for integration into Three.js render loop
   * @returns Object with compute nodes
   */
  getComputeNodes() {
    if (!this.initialized) {
      throw new Error('HeatKernelTSL not initialized');
    }

    return {
      // Compute coefficient update (cheap, run every frame)
      coeffCompute: this.computeCoeffFn().compute(this.K),
      
      // Compute field reconstruction (expensive, run every frame)
      fieldCompute: this.reconstructFieldFn().compute(this.nV),
    };
  }

  /**
   * Get heat field storage buffer for binding to material
   * @returns Storage node for heat field
   */
  getHeatFieldStorage() {
    if (!this.initialized) {
      throw new Error('HeatKernelTSL not initialized');
    }
    return this.heatFieldStorage;
  }

  /**
   * Update parameters (uniforms)
   */
  setParams(params: HeatKernelTSLParams): void {
    if (!this.initialized) {
      throw new Error('HeatKernelTSL not initialized');
    }

    const { selectedVertex, tau, Kactive } = params;

    // Validate parameters
    if (selectedVertex < 0 || selectedVertex >= this.nV) {
      throw new Error(`Invalid vertex index: ${selectedVertex} (must be 0 to ${this.nV - 1})`);
    }
    if (Kactive <= 0 || Kactive > this.K) {
      throw new Error(`Invalid Kactive: ${Kactive} (must be 1 to ${this.K})`);
    }

    // Update uniforms
    this.sourceVertexUniform.value = selectedVertex;
    this.tauUniform.value = tau;
    this.KactiveUniform.value = Kactive;
  }

  /**
   * Get current diffusion time
   */
  getCurrentTau(): number {
    return this.tauUniform?.value ?? 0;
  }

  /**
   * Get current source vertex
   */
  getCurrentSourceVertex(): number {
    return this.sourceVertexUniform?.value ?? -1;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.lambdaAttr?.dispose();
    this.psiKVAttr?.dispose();
    this.massVAttr?.dispose();
    this.coeffAttr?.dispose();
    this.heatFieldAttr?.dispose();

    this.initialized = false;
  }
}

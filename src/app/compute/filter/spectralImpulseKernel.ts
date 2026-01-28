/**
 * Layer B: Spectral Impulse Kernel Operator
 * 
 * Implements point-source filtering: psi[sourceVertex] → filter → field.
 * Owns compute graph and parameter state, reuses GPU basis.
 */

import { Fn, instanceIndex, storage, float, uniform, uint } from 'three/tsl';
import { StorageBufferAttribute } from 'three/webgpu';
import type {
  GpuBasisHandle,
  GpuFieldHandle,
  SpectralOperator,
  ImpulseKernelParams,
  OperatorOutput,
  ComputePass,
} from './types';
import { heatKernel } from './kernels/heat';

// TODO: Make this a proper kernel registry
function getKernelByType(type: string) {
  if (type === 'heat') return heatKernel;
  return null;
}

/**
 * GPU field implementation using StorageBufferAttribute.
 */
class GpuField implements GpuFieldHandle {
  readonly nV: number;
  readonly buffer: StorageBufferAttribute;
  version: number = 0;

  constructor(nV: number) {
    this.nV = nV;
    this.buffer = new StorageBufferAttribute(new Float32Array(nV), 1);
  }

  dispose(): void {
  }
}

/**
 * Spectral impulse kernel operator implementation.
 */
export class SpectralImpulseKernelOperator implements SpectralOperator {
  readonly name: string;
  readonly basis: GpuBasisHandle;
  readonly output: OperatorOutput;

  // Operator-owned GPU resources
  private coeffBuffer: StorageBufferAttribute; // Spectral coefficients (K values)
  
  // Uniforms (updated frequently)
  private sourceVertexUniform = uniform(0);
  private KactiveUniform = uniform(0);
  
  // Kernel weights (CPU + GPU)
  private kernelWeights: Float32Array;
  private kernelWeightsAttr: StorageBufferAttribute;
  
  // Current parameters
  private currentParams: ImpulseKernelParams;
  
  // Cached compute passes
  private coeffComputePass?: ComputePass;
  private fieldComputePass?: ComputePass;

  constructor(basis: GpuBasisHandle, params: ImpulseKernelParams) {
    this.name = `SpectralImpulse(${params.kernelType})`;
    this.basis = basis;
    this.currentParams = { ...params };
    
    const { K, nV } = basis.metadata;
    
    // Allocate operator-owned buffers
    this.coeffBuffer = new StorageBufferAttribute(new Float32Array(K), 1);
    this.kernelWeights = new Float32Array(K);
    this.kernelWeightsAttr = new StorageBufferAttribute(this.kernelWeights, 1);
    
    // Create output field
    const fieldHandle = new GpuField(nV);
    this.output = {
      field: fieldHandle,
      coefficients: { nV: K, buffer: this.coeffBuffer, dispose: () => {} },
    };
    
    // Initialize kernel weights and Kactive
    this.updateKernelWeights();
    
    // Build compute passes (done once, reused)
    this.buildComputePasses();
  }

  /**
   * Update operator parameters.
   * Returns true if compute needs to be re-dispatched.
   */
  updateParams(params: Partial<ImpulseKernelParams>): boolean {
    let needsRecompute = false;
    
    // Update kernel parameters
    if (params.params) {
      const oldParams = this.currentParams.params;
      this.currentParams.params = { ...oldParams, ...params.params };
      this.updateKernelWeights();
      needsRecompute = true;
    }
    
    // Update kernel type (requires weight recomputation)
    if (params.kernelType && params.kernelType !== this.currentParams.kernelType) {
      this.currentParams.kernelType = params.kernelType;
      this.updateKernelWeights();
      needsRecompute = true;
    }
    
    // Update source vertex (lightweight uniform update)
    if (params.sourceVertex !== undefined) {
      this.currentParams.sourceVertex = params.sourceVertex;
      this.sourceVertexUniform.value = params.sourceVertex;
      needsRecompute = true;
    }
    
    return needsRecompute;
  }

  /**
   * Get compute passes (cached, reused across parameter updates).
   */
  getComputePasses(): ComputePass[] {
    if (!this.coeffComputePass || !this.fieldComputePass) {
      throw new Error('SpectralImpulseKernel: compute passes not initialized');
    }
    return [this.coeffComputePass, this.fieldComputePass];
  }

  dispose(): void {
    this.output.field.dispose();
  }

  // ========== Private Implementation ==========

  /**
   * Compute kernel weights g(λ) on CPU and determine Kactive.
   */
  private updateKernelWeights(): void {
    const { K } = this.basis.metadata;
    const { kernelType, params } = this.currentParams;
    
    // Get kernel function g(λ)
    const kernel = getKernelByType(kernelType);
    if (!kernel) {
      throw new Error(`SpectralImpulseKernel: unknown kernel type "${kernelType}"`);
    }
    
    // Compute weights: g(λ_k) for k = 0..K-1
    const lambdaArray = this.basis.lambda.array as Float32Array;
    for (let k = 0; k < K; k++) {
      this.kernelWeights[k] = kernel.evaluate(lambdaArray[k], params);
    }
    
    // Determine Kactive using adaptive truncation
    const threshold = 0.01 * Math.max(...Array.from(this.kernelWeights).map(Math.abs));
    let Kactive = K;
    for (let i = K - 1; i >= 0; i--) {
      if (Math.abs(this.kernelWeights[i]) >= threshold) {
        Kactive = i + 1;
        break;
      }
    }
    
    // Update GPU buffer and uniform
    this.kernelWeightsAttr.array.set(this.kernelWeights);
    this.kernelWeightsAttr.needsUpdate = true;
    this.KactiveUniform.value = Kactive;
    this.output.Kactive = Kactive;
    
    // Debug: log sample weights
    const sampleWeights = [
      this.kernelWeights[0],
      this.kernelWeights[Math.floor(K/4)],
      this.kernelWeights[Math.floor(K/2)],
      this.kernelWeights[Math.floor(3*K/4)],
      this.kernelWeights[K-1]
    ];
  }

  /**
   * Build compute passes (done once, reused).
   */
  private buildComputePasses(): void {
    const { K, nV, layout } = this.basis.metadata;
    
    // Storage references
    const psiStorage = storage(this.basis.psi, 'float', this.basis.psi.count);
    const massStorage = storage(this.basis.mass, 'float', nV);
    const weightsStorage = storage(this.kernelWeightsAttr, 'float', K);
    const coeffStorage = storage(this.coeffBuffer, 'float', K);
    const fieldStorage = storage(this.output.field.buffer, 'float', nV);
    
    // ===== Pass 1: Compute spectral coefficients =====
    // c_k = g(λ_k) · ψ_k[sourceVertex] · mass[sourceVertex]
    const computeCoeff = Fn(() => {
      const k = instanceIndex; // One invocation per mode
      const srcV = uint(this.sourceVertexUniform);
      const Kactive = uint(this.KactiveUniform);
      
      // Bounds check
      const active = k.lessThan(Kactive);
      
      // Get ψ_k[sourceVertex]
      const psiIdx = layout === 'kMajor' 
        ? k.mul(uint(nV)).add(srcV)  // k*nV + v
        : srcV.mul(uint(K)).add(k);   // v*K + k
      
      const psiVal = psiStorage.element(psiIdx);
      const massVal = massStorage.element(srcV);
      const weight = weightsStorage.element(k);
      
      // c_k = g(λ_k) · ψ_k[v] · m[v]
      const coeff = active.select(weight.mul(psiVal).mul(massVal), float(0.0));
      coeffStorage.element(k).assign(coeff);
    })();
    
    this.coeffComputePass = {
      id: `${this.name}:coeff`,
      node: computeCoeff.compute(K),
      dispatchCount: K,
    };
    
    // ===== Pass 2: Reconstruct field from coefficients =====
    // field[v] = Σ_k c_k · ψ_k[v]
    const reconstructField = Fn(() => {
      const v = instanceIndex;
      const Kactive = uint(this.KactiveUniform);
      
      const sum = float(0.0).toVar();
      
      // Use TSL Loop construct (proper GPU loop)
      Loop({ start: uint(0), end: Kactive, type: 'uint', condition: '<' }, ({ i }: any) => {
        const psiIdx = layout === 'kMajor'
          ? i.mul(uint(nV)).add(v)
          : v.mul(uint(K)).add(i);
        
        const psiVal = psiStorage.element(psiIdx);
        const coeffVal = coeffStorage.element(i);
        sum.assign(sum.add(coeffVal.mul(psiVal)));
      });
      
      fieldStorage.element(v).assign(sum);
    })();
    
    this.fieldComputePass = {
      id: `${this.name}:field`,
      node: reconstructField.compute(nV),
      dispatchCount: nV,
    };
  }
}

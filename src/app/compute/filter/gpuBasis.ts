/**
 * Layer A: Resource Factory - CPU → GPU
 * 
 * Converts CPU-side eigenpair data into GPU-resident spectral basis.
 * This is a one-time operation per dataset/manifold.
 */

import { StorageBufferAttribute } from 'three/webgpu';
import type {
  GpuBasisHandle,
  EigenpairData,
  BasisMetadata,
  MatrixLayout,
} from './types';

/**
 * Validate eigenpair data dimensions and layout.
 */
function validateEigenpairData(data: EigenpairData): void {
  const { psi, lambda, mass, nV, K } = data;
  
  if (psi.length !== K * nV) {
    throw new Error(
      `GpuBasis: psi array size mismatch. Expected ${K * nV}, got ${psi.length}`
    );
  }
  
  if (lambda.length !== K) {
    throw new Error(
      `GpuBasis: lambda array size mismatch. Expected ${K}, got ${lambda.length}`
    );
  }
  
  if (mass.length !== nV) {
    throw new Error(
      `GpuBasis: mass array size mismatch. Expected ${nV}, got ${mass.length}`
    );
  }
  
  // Check if eigenvalues are sorted ascending (warn if not, but don't fail)
  let isSorted = true;
  for (let i = 1; i < K; i++) {
    if (lambda[i] < lambda[i - 1]) {
      isSorted = false;
      break;
    }
  }
  if (!isSorted) {
  }
  
  // Validate mass matrix is positive (warn and fix if needed)
  let hasNonPositive = false;
  const epsilon = 1e-10;
  for (let i = 0; i < nV; i++) {
    if (mass[i] <= 0) {
      hasNonPositive = true;
      mass[i] = epsilon; // Fix by clamping to small positive value
    }
  }
  if (hasNonPositive) {
  }
}

/**
 * Convert eigenpair data layout if needed.
 * Input is assumed to be kMajor (K×nV row-major).
 * Output is transposed if vMajor is requested.
 */
function transposeIfNeeded(
  psi: Float32Array,
  K: number,
  nV: number,
  targetLayout: MatrixLayout
): Float32Array {
  if (targetLayout === 'kMajor') {
    return psi; // No change
  }
  
  // Transpose: kMajor → vMajor
  const transposed = new Float32Array(K * nV);
  for (let k = 0; k < K; k++) {
    for (let v = 0; v < nV; v++) {
      transposed[v * K + k] = psi[k * nV + v];
    }
  }
  return transposed;
}

/**
 * GPU spectral basis implementation using StorageBufferAttribute.
 */
class GpuBasisBuffer implements GpuBasisHandle {
  readonly metadata: BasisMetadata;
  readonly psi: StorageBufferAttribute;
  readonly lambda: StorageBufferAttribute;
  readonly mass: StorageBufferAttribute;

  constructor(data: EigenpairData) {
    const { nV, K } = data;
    const layout = data.layout || 'kMajor';
    const storage = data.storage || 'buffer';
    
    this.metadata = { nV, K, layout, storage };
    
    // Transpose psi if needed
    const psiData = transposeIfNeeded(data.psi, K, nV, layout);
    
    // Create GPU buffers (uploaded immediately)
    this.psi = new StorageBufferAttribute(psiData, 1);
    this.lambda = new StorageBufferAttribute(data.lambda, 1);
    this.mass = new StorageBufferAttribute(data.mass, 1);
  }

  dispose(): void {
    // StorageBufferAttribute doesn't have explicit dispose, but mark for GC
  }
}

/**
 * Factory function to create GPU spectral basis from eigenpair data.
 * 
 * @param data - CPU-side eigenpair arrays and metadata
 * @returns GPU-resident spectral basis handle
 * 
 * @example
 * ```typescript
 * const basis = GpuBasis.fromEigenpairs({
 *   psi: eigenvectors,  // Float32Array of size K*nV
 *   lambda: eigenvalues, // Float32Array of size K
 *   mass: massVector,    // Float32Array of size nV
 *   nV: 1889,
 *   K: 300,
 *   layout: 'kMajor',
 *   storage: 'buffer',
 * });
 * ```
 */
export class GpuBasis {
  /**
   * Create GPU basis from eigenpair data.
   * Validates input, uploads to GPU, and returns a handle.
   */
  static fromEigenpairs(data: EigenpairData): GpuBasisHandle {
    validateEigenpairData(data);
    
    const storage = data.storage || 'buffer';
    
    if (storage === 'texture') {
      // TODO: Implement DataTexture-based storage for large K or nV
      throw new Error('GpuBasis: texture storage not yet implemented');
    }
    
    return new GpuBasisBuffer(data);
  }
}

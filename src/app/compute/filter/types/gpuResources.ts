/**
 * Type definitions for GPU resource handles and metadata.
 * These types define the boundary between CPU-side data and GPU-resident resources.
 */

import type { StorageBufferAttribute } from 'three/webgpu';

/**
 * Layout strategy for 2D data in GPU buffers/textures.
 * - kMajor: psi[k,v] stored as k*nV + v (spectral modes contiguous)
 * - vMajor: psi[k,v] stored as v*K + k (vertices contiguous)
 */
export type MatrixLayout = 'kMajor' | 'vMajor';

/**
 * GPU storage strategy.
 * - buffer: StorageBufferAttribute (good for K < 1000, nV < 100k)
 * - texture: DataTexture (better for large K or nV, 2D addressing)
 */
export type StorageStrategy = 'buffer' | 'texture';

/**
 * Metadata describing the spectral basis dimensions and layout.
 */
export interface BasisMetadata {
  /** Number of vertices */
  nV: number;
  /** Number of spectral modes (eigenvectors) */
  K: number;
  /** Layout of eigenvector matrix in GPU memory */
  layout: MatrixLayout;
  /** Storage strategy used */
  storage: StorageStrategy;
}

/**
 * GPU handle for the spectral basis (eigenvectors + eigenvalues + mass matrix).
 * This is a read-only resource created once per manifold/dataset.
 */
export interface GpuBasisHandle {
  /** Metadata */
  readonly metadata: BasisMetadata;
  
  /** Eigenvector matrix: psi[k,v] or psi[v,k] depending on layout */
  readonly psi: StorageBufferAttribute;
  
  /** Eigenvalues: lambda[k] (K values) */
  readonly lambda: StorageBufferAttribute;
  
  /** Mass matrix diagonal: mass[v] (nV values) */
  readonly mass: StorageBufferAttribute;
  
  /** Dispose GPU resources */
  dispose(): void;
}

/**
 * GPU handle for a scalar field defined on mesh vertices.
 * This is a mutable resource that can be written by compute passes.
 */
export interface GpuFieldHandle {
  /** Number of vertices */
  readonly nV: number;
  
  /** Field values: field[v] (nV values) */
  readonly buffer: StorageBufferAttribute;
  
  /** Optional metadata for tracking updates */
  version?: number;
  
  /** Dispose GPU resources */
  dispose(): void;
}

/**
 * Input data for creating a spectral basis (CPU-side arrays).
 */
export interface EigenpairData {
  /** Eigenvector matrix (row-major K×nV or column-major nV×K) */
  psi: Float32Array;
  
  /** Eigenvalues (K values) */
  lambda: Float32Array;
  
  /** Mass matrix diagonal (nV values) */
  mass: Float32Array;
  
  /** Number of vertices */
  nV: number;
  
  /** Number of spectral modes */
  K: number;
  
  /** Desired layout (default: kMajor) */
  layout?: MatrixLayout;
  
  /** Desired storage strategy (default: buffer) */
  storage?: StorageStrategy;
}

/**
 * GPU resource key generation utilities
 * 
 * Provides stable, unique keys for GPU resources to enable
 * deduplication and lifetime tracking.
 * 
 * Keys are based on manifoldId only (no hashing) since manifold IDs
 * are already unique identifiers.
 */

/**
 * Generate key for manifold position buffer
 */
export function manifoldPositionsKey(manifoldId: string): string {
  return `manifold:${manifoldId}:positions`;
}

/**
 * Generate key for manifold index buffer
 */
export function manifoldIndicesKey(manifoldId: string): string {
  return `manifold:${manifoldId}:indices`;
}

/**
 * Generate key for complete manifold geometry (positions + indices + normals)
 */
export function manifoldGeometryKey(manifoldId: string): string {
  return `manifold:${manifoldId}:geometry`;
}

/**
 * Generate key for manifold eigenvector buffer
 */
export function manifoldEigenvectorsKey(manifoldId: string, K: number, layout: string): string {
  return `manifold:${manifoldId}:eigenvectors:${K}:${layout}`;
}

/**
 * Generate key for manifold eigenvalue buffer
 */
export function manifoldEigenvaluesKey(manifoldId: string, K: number): string {
  return `manifold:${manifoldId}:eigenvalues:${K}`;
}

/**
 * Generate key for field scalar buffer
 */
export function fieldScalarKey(fieldId: string): string {
  return `field:${fieldId}:vertexScalar`;
}

/**
 * Generate key for compute output buffer (inverse transform result)
 */
export function computeInverseTransformKey(
  manifoldId: string,
  Kactive: number,
  source: string
): string {
  return `compute:${manifoldId}:inverseTransform:${Kactive}:${source}`;
}

/**
 * Generate key for spectral coefficients buffer
 */
export function spectralCoefficientsKey(manifoldId: string, Kactive: number): string {
  return `spectral:${manifoldId}:coefficients:${Kactive}`;
}

/**
 * Generate temporary/transient buffer key
 */
export function tempBufferKey(purpose: string, id: string): string {
  return `temp:${purpose}:${id}`;
}

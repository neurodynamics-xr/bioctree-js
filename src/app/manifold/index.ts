/**
 * index.ts
 * 
 * Main exports for the manifold module.
 * This module handles manifold object creation and data ownership.
 */

export {
  Manifold,
  createManifold,
  createManifoldFromBCT,
  generateManifoldId,
  computeBounds,
  type ManifoldCore,
  type ManifoldGeometry,
  type ManifoldTopology,
  type ManifoldEigenmodes,
  type ManifoldMetadata,
  type ManifoldAvailability,
  type ManifoldCreateOptions
} from './Manifold';

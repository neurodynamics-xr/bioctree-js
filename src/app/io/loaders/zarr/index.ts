// Public API exports for BCT Zarr loader package

// Core loaders
export { loadManifoldFromZarr } from './manifold';
export { loadEigenmodesFromZarr, loadSingleEigenmode } from './eigenmodes';
export { loadOperatorFromZarr, loadMassMatrix, loadStiffnessMatrix, extractDiagonalFromCOO } from './operators';

// Store utilities
export { openZarrStore, readArray, readAttrs, checkGroupExists, listZarrGroups, readRawAttrs } from './store';

// TypeScript interfaces
export type {
  // Root attributes
  BCTRootAttrs,
  
  // Group attributes
  BCTManifoldAttrs,
  BCTEigenmodesAttrs,
  BCTGeometryAttrs,
  BCTTopologyAttrs,
  BCTOperatorsAttrs,
  
  // Data structures
  ZarrManifold,
  ZarrEigenmodes,
  ZarrGeometry,
  ZarrTopology,
  ZarrOperators,
  ZarrOperator,
  
  // Options
  LoadManifoldOptions,
  LoadEigenmodesOptions,
  LoadOperatorOptions,
} from './types';

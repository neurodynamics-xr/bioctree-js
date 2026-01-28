/**
 * IO Module - Public API
 * 
 * Central exports for all data loading functionality
 */

// Loaders
export { loadManifold, extractRawData } from './loaders/manifoldLoader';
export { loadScalarField, loadVectorField, validateFieldManifoldMatch } from './loaders/fieldLoader';
export { loadBCT, loadBCTFromData } from './loaders/bct';
export { loadZarr, loadZarrFromData, getZarrMetadata } from './loaders/zarrLoader';

// Types
export type {
  ManifoldFormat,
  FieldFormat,
  BCTFormat,
  RawManifoldData,
  ManifoldData,
  ScalarFieldData,
  VectorFieldData,
  BCTSpectralData,
  BCTPackage,
  LoadProgress,
  LoadOptions,
  LoadResult,
  ZarrManifoldMetadata,
  ZarrCoordinateSystem,
  ZarrFaceWinding,
  ZarrMetric,
  ZarrStoreOptions,
} from './loaders/types';

/**
 * Central export for all filter system types.
 * Import from here for clean boundaries between layers.
 */

// Layer A: Resource types
export type {
  MatrixLayout,
  StorageStrategy,
  BasisMetadata,
  GpuBasisHandle,
  GpuFieldHandle,
  EigenpairData,
} from './gpuResources';

// Layer B: Operator types
export type {
  ComputePass,
  ImpulseKernelParams,
  OperatorOutput,
  SpectralOperator,
  SpectralOperatorFactory,
} from './operators';

// Layer C: Material types
export type {
  ColormapType,
  RangeStrategy,
  ScalarFieldMaterialConfig,
  ScalarFieldMaterialAdapter,
  ScalarFieldMaterialFactory,
} from './materials';

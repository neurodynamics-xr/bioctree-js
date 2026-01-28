/**
 * Spectral filter system
 * 
 * REFACTORED ARCHITECTURE (Three-Layer Separation):
 * 
 * Layer A: Resource Factory (CPU → GPU)
 *   - gpuBasis.ts: GpuBasis.fromEigenpairs() - one-time upload
 *   - types/gpuResources.ts: Handle types (GpuBasisHandle, GpuFieldHandle)
 * 
 * Layer B: Operator (compute graph + parameters)
 *   - spectralImpulseKernel.ts: SpectralImpulseKernelOperator
 *   - types/operators.ts: Operator interface (updateParams, getComputePasses)
 * 
 * Layer C: Render Binding (field → material)
 *   - scalarFieldMaterial.ts: createScalarFieldMaterial()
 *   - types/materials.ts: Material adapter interface
 * 
 * USAGE (New Pattern):
 * ```typescript
 * // 1. Create GPU basis from manifold (one-time, heavy)
 * const basis = GpuBasis.fromEigenpairs({
 *   psi: eigenvectors,
 *   lambda: eigenvalues,
 *   mass: massVector,
 *   nV, K,
 * });
 * 
 * // 2. Create operator (one-time, graph assembly)
 * const operator = new SpectralImpulseKernelOperator(basis, {
 *   kernelType: 'heat',
 *   sourceVertex: 0,
 *   params: { tau: 0.01 },
 * });
 * 
 * // 3. Create material (one-time, render binding)
 * const material = createScalarFieldMaterial({
 *   field: operator.output.field,
 *   colormap: 'viridis',
 *   range: 'auto',
 * });
 * mesh.material = material.material;
 * 
 * // 4. Render loop (dispatch compute, then render)
 * const passes = operator.getComputePasses();
 * passes.forEach(pass => renderer.compute(pass.node));
 * renderer.render(scene, camera);
 * 
 * // 5. Update parameters (lightweight, no reallocation)
 * operator.updateParams({ sourceVertex: 42, params: { tau: 0.02 } });
 * material.updateConfig({ colormap: 'inferno' });
 * ```
 */

// ========== NEW ARCHITECTURE (Three-Layer) ==========

// Re-export all three layers
export { GpuBasis } from './gpuBasis';
export { SpectralImpulseKernelOperator } from './spectralImpulseKernel';
export { createScalarFieldMaterial } from './scalarFieldMaterial';

// Re-export types
export type {
  // Layer A
  GpuBasisHandle,
  GpuFieldHandle,
  EigenpairData,
  BasisMetadata,
  MatrixLayout,
  StorageStrategy,
  
  // Layer B
  SpectralOperator,
  ImpulseKernelParams,
  OperatorOutput,
  ComputePass,
  
  // Layer C
  ScalarFieldMaterialAdapter,
  ScalarFieldMaterialConfig,
  ColormapType,
  RangeStrategy,
} from './types';

import type { EigenpairData } from './types';
import { GpuBasis } from './gpuBasis';
import { SpectralImpulseKernelOperator } from './spectralImpulseKernel';
import { createScalarFieldMaterial } from './scalarFieldMaterial';

/**
 * Convenience function for quick setup (all three layers).
 * Use this when you want a simple one-shot API.
 */
export function createSpectralFilterPipeline(options: {
  // Layer A
  eigenpairs: EigenpairData;
  
  // Layer B
  kernelType: string;
  sourceVertex: number;
  params: Record<string, number>;
  
  // Layer C
  colormap?: 'viridis' | 'inferno' | 'plasma' | 'magma' | 'turbo' | 'coolwarm';
  range?: 'auto' | 'symmetric' | { min: number; max: number };
}) {
  // Layer A: Create basis
  const basis = GpuBasis.fromEigenpairs(options.eigenpairs);
  
  // Layer B: Create operator
  const operator = new SpectralImpulseKernelOperator(basis, {
    kernelType: options.kernelType,
    sourceVertex: options.sourceVertex,
    params: options.params,
  });
  
  // Layer C: Create material
  const materialAdapter = createScalarFieldMaterial({
    field: operator.output.field,
    colormap: options.colormap || 'viridis',
    range: options.range || 'auto',
  });
  
  return {
    basis,
    operator,
    materialAdapter,
    
    /** Get compute passes to dispatch in render loop */
    getComputePasses: () => operator.getComputePasses(),
    
    /** Update operator parameters (lightweight) */
    updateParams: (params: Partial<{
      kernelType: string;
      sourceVertex: number;
      params: Record<string, number>;
    }>) => operator.updateParams(params),
    
    /** Update material config */
    updateMaterial: (config: Partial<{
      colormap: 'viridis' | 'inferno' | 'plasma' | 'magma' | 'turbo' | 'coolwarm';
      range: 'auto' | 'symmetric' | { min: number; max: number };
    }>) => materialAdapter.updateConfig(config),
    
    /** Dispose all resources */
    dispose: () => {
      materialAdapter.dispose();
      operator.dispose();
      basis.dispose();
    },
  };
}

// ========== LEGACY EXPORTS (backward compatibility) ==========

// Filter design (GPU - interactive point-source) [DEPRECATED]
export { FilterDesign } from './design';
export type { FilterDesignConfig } from './design';

// Filter application (GPU - general fields) [DEPRECATED]
export { SpectralFilterTSL } from './apply';
export type { SpectralFilterTSLConfig } from './apply';

// Kernel parameter exploration (CPU) [STILL USEFUL]
export { FilterParameters, computeEffectiveRank } from './kernels/design';

// Kernel library (pure math) [STILL USEFUL]
export { heatKernel } from './kernels/heat';



/**
 * Type definitions for scalar field visualization.
 * These types define the render stage: field → material.
 */

import type { GpuFieldHandle } from './gpuResources';
import type { Material } from 'three';

/**
 * Colormap identifier (matches colormapTSL.ts).
 */
export type ColormapType = 'viridis' | 'inferno' | 'plasma' | 'magma' | 'turbo' | 'coolwarm';

/**
 * Value range strategy for colormap normalization.
 */
export type RangeStrategy = 
  | 'auto'              // Compute min/max from field (requires GPU reduction)
  | 'symmetric'         // Use [-max(abs), max(abs)]
  | { min: number; max: number }; // Explicit range

/**
 * Configuration for scalar field material adapter.
 */
export interface ScalarFieldMaterialConfig {
  /** Input scalar field */
  field: GpuFieldHandle;
  
  /** Colormap to use */
  colormap: ColormapType;
  
  /** Value range for normalization */
  range: RangeStrategy;
  
  /** Optional: show wireframe overlay */
  wireframe?: boolean;
  
  /** Optional: opacity (for transparent materials) */
  opacity?: number;
}

/**
 * Adapter that creates a Three.js material from a scalar field.
 * Handles colormap lookup, normalization, and lighting integration.
 */
export interface ScalarFieldMaterialAdapter {
  /** Generated material (can be assigned to mesh) */
  readonly material: Material;
  
  /** Current configuration */
  readonly config: ScalarFieldMaterialConfig;
  
  /**
   * Update configuration (e.g., change colormap or range).
   * Updates material nodes in place without reallocation.
   */
  updateConfig(config: Partial<ScalarFieldMaterialConfig>): void;
  
  /**
   * Force recompute of value range (for 'auto' strategy).
   * Returns a Promise that resolves when reduction is complete.
   */
  recomputeRange(): Promise<{ min: number; max: number }>;
  
  /**
   * Dispose material resources.
   */
  dispose(): void;
}

/**
 * Factory function signature for creating scalar field materials.
 */
export type ScalarFieldMaterialFactory = (
  config: ScalarFieldMaterialConfig
) => ScalarFieldMaterialAdapter;

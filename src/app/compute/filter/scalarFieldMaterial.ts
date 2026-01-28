/**
 * Layer C: Scalar Field Material Adapter
 * 
 * Creates a Three.js material that visualizes a scalar field using colormaps.
 * Handles normalization, colormap lookup, and lighting integration.
 */

import { Fn, instanceIndex, storage, uniform, mix, vec3, vec4, float, clamp } from 'three/tsl';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import type {
  ScalarFieldMaterialAdapter,
  ScalarFieldMaterialConfig,
  ColormapType,
  RangeStrategy,
} from './types';

/**
 * Polynomial colormap approximations (inline for now)
 * TODO: Consider migrating to atlas-based colormaps from tsl/colormap.ts
 */
const viridisColor = Fn(([t_in]: [any]) => {
  const t = clamp(t_in, 0.0, 1.0);
  const r = float(0.267).add(t.mul(1.533)).sub(t.mul(t).mul(1.761)).add(t.mul(t).mul(t).mul(0.733));
  const g = float(0.004).add(t.mul(1.385)).sub(t.mul(t).mul(0.897)).add(t.mul(t).mul(t).mul(0.261));
  const b = float(0.329).add(t.mul(1.191)).add(t.mul(t).mul(2.082)).sub(t.mul(t).mul(t).mul(2.374));
  return vec3(r, g, b).clamp(0.0, 1.0);
});

const infernoColor = Fn(([t_in]: [any]) => {
  const t = clamp(t_in, 0.0, 1.0);
  const r = float(0.0).add(t.mul(1.6)).add(t.mul(t).mul(-0.6));
  const g = float(0.0).add(t.mul(t).mul(1.5)).add(t.mul(t).mul(t).mul(-0.5));
  const b = float(0.5).add(t.mul(-1.5)).add(t.mul(t).mul(1.5)).add(t.mul(t).mul(t).mul(-0.5));
  return vec3(r, g, b).clamp(0.0, 1.0);
});

const plasmaColor = Fn(([t_in]: [any]) => {
  const t = clamp(t_in, 0.0, 1.0);
  const r = float(0.241).add(t.mul(2.878)).sub(t.mul(t).mul(2.777)).add(t.mul(t).mul(t).mul(1.147));
  const g = float(0.015).add(t.mul(0.671)).add(t.mul(t).mul(2.128)).sub(t.mul(t).mul(t).mul(1.765));
  const b = float(0.529).add(t.mul(0.941)).sub(t.mul(t).mul(2.481)).add(t.mul(t).mul(t).mul(1.435));
  return vec3(r, g, b).clamp(0.0, 1.0);
});

const coolwarmColor = Fn(([t_in]: [any]) => {
  const t = clamp(t_in, 0.0, 1.0);
  const r = float(0.230).add(t.mul(2.378)).sub(t.mul(t).mul(2.737)).add(t.mul(t).mul(t).mul(1.128));
  const g = float(0.299).add(t.mul(0.104)).add(t.mul(t).mul(0.561)).sub(t.mul(t).mul(t).mul(0.964));
  const b = float(0.754).sub(t.mul(2.349)).add(t.mul(t).mul(2.236)).sub(t.mul(t).mul(t).mul(0.641));
  return vec3(r, g, b).clamp(0.0, 1.0);
});

const grayscaleColor = Fn(([t_in]: [any]) => {
  const t = clamp(t_in, 0.0, 1.0);
  return vec3(t, t, t);
});

/**
 * Get colormap function by name.
 * Uses proper polynomial approximations from colormapTSL.ts.
 */
function getColormapFunction(name: ColormapType) {
  switch (name) {
    case 'viridis': return viridisColor;
    case 'inferno': return infernoColor;
    case 'plasma': return plasmaColor;
    case 'coolwarm': return coolwarmColor;
    case 'grayscale': return grayscaleColor;
    default: return viridisColor;
  }
}

/**
 * Scalar field material implementation.
 */
export class ScalarFieldMaterial implements ScalarFieldMaterialAdapter {
  readonly material: MeshStandardNodeMaterial;
  readonly config: ScalarFieldMaterialConfig;
  
  private minUniform = uniform(0.0);
  private maxUniform = uniform(1.0);
  private fieldStorage: any; // storage() reference

  constructor(config: ScalarFieldMaterialConfig) {
    this.config = { ...config };
    
    // Create storage reference for field
    this.fieldStorage = storage(
      config.field.buffer,
      'float',
      config.field.nV
    );
    
    // Initialize range
    this.updateRange(config.range);
    
    // Create material
    this.material = new MeshStandardNodeMaterial({
      wireframe: config.wireframe || false,
      transparent: config.opacity !== undefined && config.opacity < 1.0,
      opacity: config.opacity || 1.0,
    });
    
    // Build color node
    this.buildColorNode(config.colormap);
  }

  updateConfig(config: Partial<ScalarFieldMaterialConfig>): void {
    // Update colormap
    if (config.colormap && config.colormap !== this.config.colormap) {
      this.config.colormap = config.colormap;
      this.buildColorNode(config.colormap);
    }
    
    // Update range
    if (config.range) {
      this.config.range = config.range;
      this.updateRange(config.range);
    }
    
    // Update wireframe
    if (config.wireframe !== undefined) {
      this.config.wireframe = config.wireframe;
      this.material.wireframe = config.wireframe;
    }
    
    // Update opacity
    if (config.opacity !== undefined) {
      this.config.opacity = config.opacity;
      this.material.transparent = config.opacity < 1.0;
      this.material.opacity = config.opacity;
    }
  }

  async recomputeRange(): Promise<{ min: number; max: number }> {
    // TODO: Implement GPU-based min/max reduction
    // For now, read back field to CPU (inefficient but correct)
    const fieldArray = this.config.field.buffer.array as Float32Array;
    let min = Infinity;
    let max = -Infinity;
    
    for (let i = 0; i < fieldArray.length; i++) {
      const val = fieldArray[i];
      if (!isNaN(val) && isFinite(val)) {
        min = Math.min(min, val);
        max = Math.max(max, val);
      }
    }
    
    if (!isFinite(min) || !isFinite(max)) {
      min = 0;
      max = 1;
    }
    
    this.minUniform.value = min;
    this.maxUniform.value = max;
    return { min, max };
  }

  dispose(): void {
    this.material.dispose();
  }

  // ========== Private Implementation ==========

  private updateRange(range: RangeStrategy): void {
    if (range === 'auto') {
      // Will be computed on first render or manually
      this.minUniform.value = 0;
      this.maxUniform.value = 1;
    } else if (range === 'symmetric') {
      // Will be computed from field max(abs)
      // TODO: Implement GPU reduction for max(abs)
      this.minUniform.value = -1;
      this.maxUniform.value = 1;
    } else {
      // Explicit range
      this.minUniform.value = range.min;
      this.maxUniform.value = range.max;
    }
  }

  private buildColorNode(colormap: ColormapType): void {
    // Color node: field[vertexIndex] → normalize → colormap → color
    const colormapFn = getColormapFunction(colormap);
    
    this.material.colorNode = Fn(() => {
      // Get field value for this vertex
      const vIdx = instanceIndex;
      const fieldValue = this.fieldStorage.element(vIdx);
      
      // Normalize to [0, 1]
      const minVal = this.minUniform;
      const maxVal = this.maxUniform;
      const range = maxVal.sub(minVal);
      const t = fieldValue.sub(minVal).div(range).clamp(0.0, 1.0);
      
      // Apply colormap
      const color = colormapFn(t);
      
      return vec4(color, 1.0);
    })();
  }
}

/**
 * Factory function to create scalar field material adapter.
 * 
 * @param config - Material configuration
 * @returns Material adapter that can be assigned to mesh
 * 
 * @example
 * ```typescript
 * const materialAdapter = createScalarFieldMaterial({
 *   field: operator.output.field,
 *   colormap: 'viridis',
 *   range: 'auto',
 * });
 * mesh.material = materialAdapter.material;
 * ```
 */
export function createScalarFieldMaterial(
  config: ScalarFieldMaterialConfig
): ScalarFieldMaterialAdapter {
  return new ScalarFieldMaterial(config);
}

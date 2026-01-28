/**
 * colormap.ts
 * 
 * TSL shader-graph building blocks for colormap operations.
 * 
 * This module provides reusable TSL (Three.js Shading Language) functions
 * for color mapping operations. These are pure shader-graph nodes that can
 * be composed into materials or compute shaders without coupling to viewer
 * components or GPU resource management.
 * 
 * Design Philosophy:
 * - Pure TSL node composition (no scene/camera/mesh coupling)
 * - No texture loading (accepts pre-loaded texture nodes)
 * - Reusable across render materials and compute graphs
 * - Standalone shader library for color mapping operations
 * 
 * Usage Example:
 * ```ts
 * import * as THREE from 'three/webgpu';
 * import { texture } from 'three/tsl';
 * import { FloatToColormap } from '@/app/tsl/colormap';
 * 
 * // Load texture via GPU resource manager (not in this module)
 * const atlasTex = gpu.getOrCreateTexture('colormaps_atlas', '/colormap_atlas.png');
 * 
 * // Create TSL texture node
 * const atlasNode = texture(atlasTex);
 * 
 * // Use in shader
 * const rgb = FloatToColormap(scalarValue, minV, maxV, atlasNode, colormapIndex, 8);
 * material.colorNode = rgb;
 * ```
 */

import { Fn, vec2, float, clamp } from 'three/tsl';

export type ColormapType = 
  | 'viridis' 
  | 'inferno' 
  | 'plasma' 
  | 'blackbody' 
  | 'kindlmann'
  | 'moreland'
  | 'coolwarm'
  | 'parula'
  | 'turbo'
  | 'hot'
  | 'cool'
  | 'summer'
  | 'spring'
  | 'winter'
  | 'bone'
  | 'copper';

/**
 * Map colormap type names to atlas row indices.
 * Assumes colormaps are stacked vertically in the atlas texture.
 * Atlas contains 16 colormaps total in the following order:
 * 
 * 0: viridis
 * 1: inferno
 * 2: plasma
 * 3: blackbody
 * 4: kindlmann
 * 5: moreland
 * 6: coolwarm (bentcoolwarm)
 * 7: parula
 * 8: turbo
 * 9: hot
 * 10: cool
 * 11: summer
 * 12: spring
 * 13: winter
 * 14: bone
 * 15: copper
 */
export const COLORMAP_INDICES: Record<ColormapType, number> = {
  'viridis': 0,
  'inferno': 1,
  'plasma': 2,
  'blackbody': 3,
  'kindlmann': 4,
  'moreland': 5,
  'coolwarm': 6,
  'parula': 7,
  'turbo': 8,
  'hot': 9,
  'cool': 10,
  'summer': 11,
  'spring': 12,
  'winter': 13,
  'bone': 14,
  'copper': 15
};

/**
 * FloatToColormap
 * 
 * Pure TSL function that maps a scalar value to RGB color using a colormap atlas texture.
 * 
 * @param scalarNode - TSL node providing the scalar value to map
 * @param minValueNode - Minimum value for normalization (can be uniform or constant)
 * @param maxValueNode - Maximum value for normalization (can be uniform or constant)
 * @param atlasTextureNode - Pre-loaded atlas texture as a TSL texture node
 * @param colormapIndexNode - Row index in the atlas (0-based, can be uniform or constant)
 * @param numColormapsNode - Total number of colormaps in atlas (for V coordinate calculation)
 * @returns TSL node outputting vec3 RGB color
 * 
 * @example
 * ```ts
 * import { texture, uniform, storage } from 'three/tsl';
 * import { FloatToColormap } from '@/app/tsl/colormap';
 * 
 * const scalarStorage = storage(scalarAttr, 'float', nV);
 * const atlasNode = texture(atlasTex);
 * const minUniform = uniform(0.0);
 * const maxUniform = uniform(1.0);
 * const colormapIndex = uniform(2); // inferno
 * 
 * const colorNode = FloatToColormap(
 *   scalarStorage.element(vertexIndex),
 *   minUniform,
 *   maxUniform,
 *   atlasNode,
 *   colormapIndex,
 *   8 // total colormaps in atlas
 * );
 * ```
 */
export const FloatToColormap = Fn(
  (
    [scalarNode, minValueNode, maxValueNode, atlasTextureNode, colormapIndexNode, numColormapsNode]: [
      any,
      any,
      any,
      any,
      any,
      any
    ]
  ) => {
    // Normalize scalar value to [0, 1] range
    const scalar = float(scalarNode);
    const minVal = float(minValueNode);
    const maxVal = float(maxValueNode);
    
    const range = maxVal.sub(minVal);
    const normalized = scalar.sub(minVal).div(range).toVar();
    
    // Clamp to [0, 1] to handle out-of-range values
    const t = clamp(normalized, 0.0, 1.0);
    
    // Calculate UV coordinates for atlas lookup
    // U: normalized scalar value (horizontal position in colormap)
    // V: colormap row in atlas (vertical position)
    const colormapIndex = float(colormapIndexNode);
    const numColormaps = float(numColormapsNode);
    
    // Calculate V coordinate: center of the colormap row
    // If we have 8 colormaps, each occupies 1/8 of the height
    // Sample from the center of each row: (index + 0.5) / total
    const rowHeight = float(1.0).div(numColormaps);
    const v = colormapIndex.add(0.5).mul(rowHeight);
    
    const uv = vec2(t, v);
    
    // Sample the atlas texture
    // Note: atlasTextureNode should be a texture() node created from THREE.Texture
    const color = atlasTextureNode.sample(uv);
    
    // Return RGB (color is vec4, we extract rgb)
    return color.rgb;
  }
);

/**
 * Helper function to get colormap index from name.
 * Use this to convert ColormapType to the numeric index needed by FloatToColormap.
 * 
 * @param colormapType - Colormap name
 * @returns Row index in atlas (0-7)
 * 
 * @example
 * ```ts
 * const index = getColormapIndex('inferno'); // returns 2
 * const colorNode = FloatToColormap(scalar, min, max, atlas, index, 8);
 * ```
 */
export function getColormapIndex(colormapType: ColormapType): number {
  return COLORMAP_INDICES[colormapType];
}

/**
 * Convenience wrapper that accepts colormap name instead of index.
 * 
 * @param scalarNode - Scalar value to map
 * @param atlasTextureNode - Pre-loaded atlas texture node
 * @param colormapType - Colormap name (e.g., 'inferno')
 * @param minValueNode - Min value for normalization (default: -1)
 * @param maxValueNode - Max value for normalization (default: 1)
 * @returns RGB color node
 * 
 * @example
 * ```ts
 * // With default range [-1, 1]
 * const colorNode = createColormapNode(
 *   scalarStorage.element(vertexIndex),
 *   texture(atlasTex),
 *   'inferno'
 * );
 * 
 * // With custom range
 * const colorNode = createColormapNode(
 *   scalarStorage.element(vertexIndex),
 *   texture(atlasTex),
 *   'inferno',
 *   minUniform,
 *   maxUniform
 * );
 * ```
 */
export const createColormapNode = (
  scalarNode: any,
  atlasTextureNode: any,
  colormapType: ColormapType,
  minValueNode: any = -1,
  maxValueNode: any = 1
): any => {
  const colormapIndex = getColormapIndex(colormapType);
  // Always use 16 colormaps (current atlas size)
  return FloatToColormap(scalarNode, minValueNode, maxValueNode, atlasTextureNode, colormapIndex, 16);
};

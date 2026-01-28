/**
 * COLORMAP ATLAS USAGE EXAMPLE
 * 
 * This file demonstrates how to use the colormap atlas texture
 * with the GPUResourceManager in viewer components.
 */

// Example 1: Loading the colormap atlas in render.ts
// =====================================================

import { GPUResourceManager } from '@/app/gpu/GPUResourceManager';

// In your init() function or where you need the colormap:
function initColormaps(gpu: GPUResourceManager) {
  // Load the colormap atlas texture
  const atlasTexture = gpu.getOrCreateTexture(
    'colormaps_atlas',           // Unique key for caching
    '/colormap_atlas.png',        // Path to the texture in public/
    {
      colorSpace: 'srgb',         // SRGB for color data
      filtering: 'linear',        // Linear interpolation for smooth gradients
      wrapping: 'clamp',          // Clamp to edge to avoid wrapping
      generateMipmaps: false      // No mipmaps for LUT textures
    }
  );

  console.log('Colormap atlas loaded:', atlasTexture);
  return atlasTexture;
}

// Example 2: Using the atlas in a TSL material
// =====================================================

import * as THREE from 'three/webgpu';
import { texture, uniform, uv, vec2, Fn } from 'three/tsl';

function createColormapMaterial(
  gpu: GPUResourceManager,
  scalarStorage: any,
  colormapIndex: number,
  minValue: number,
  maxValue: number
) {
  // Get or load the atlas texture
  const atlasTexture = gpu.getOrCreateTexture(
    'colormaps_atlas',
    '/colormap_atlas.png',
    {
      colorSpace: 'srgb',
      filtering: 'linear',
      wrapping: 'clamp',
      generateMipmaps: false
    }
  );

  // Create TSL uniforms
  const minUniform = uniform(minValue);
  const maxUniform = uniform(maxValue);
  const colormapIndexUniform = uniform(colormapIndex); // Row index in atlas

  // Create colormap lookup function
  const colormapLookup = Fn(() => {
    // Get scalar value from storage buffer
    const scalar = scalarStorage.element(vertexIndex);
    
    // Normalize to [0, 1] range
    const t = scalar.sub(minUniform).div(maxUniform.sub(minUniform)).clamp(0, 1);
    
    // Calculate UV coordinates for atlas lookup
    // Assuming 8 colormaps stacked vertically (each 1/8 height)
    const u = t;  // Horizontal: scalar value [0, 1]
    const v = colormapIndexUniform.div(8.0);  // Vertical: colormap row
    
    const atlasUV = vec2(u, v);
    
    // Sample the atlas texture
    const color = texture(atlasTexture, atlasUV);
    
    return color;
  });

  // Create material with colormap
  const material = new THREE.MeshStandardNodeMaterial();
  material.colorNode = colormapLookup();
  
  return material;
}

// Example 3: Cleanup when done
// =====================================================

function cleanupColormaps(gpu: GPUResourceManager) {
  // Release the texture (decrements ref count)
  gpu.releaseTexture('colormaps_atlas');
  
  // Texture will be automatically disposed when ref count reaches 0
}

// Example 4: Integration with tsl/colormap.ts
// =====================================================

// In src/app/tsl/colormap.ts, you can implement:

export function createColormapNode(
  scalarNode: any,
  colormapType: ColormapType,
  minValue: number,
  maxValue: number
): any {
  // Map colormap type to atlas row index
  const colormapIndexMap = {
    'viridis': 0,
    'plasma': 1,
    'inferno': 2,
    'magma': 3,
    'cividis': 4,
    'turbo': 5,
    'coolwarm': 6,
    'grayscale': 7
  };
  
  const colormapIndex = colormapIndexMap[colormapType] || 0;
  
  // Create TSL lookup function using the atlas
  // (Implementation depends on how you access the atlas texture in TSL context)
  // This is a simplified example - actual implementation may vary
}

// Example 5: Using in ViewerWebGPU
// =====================================================

// In render.ts setFieldColormap() function:
export function setFieldColormap(
  scalarStorage: any,
  colormap: ColormapType,
  minValue: number,
  maxValue: number
): void {
  if (!mesh || !gpu) {
    console.warn('[ViewerWebGPU] No mesh or GPU manager available');
    return;
  }

  console.log(`[ViewerWebGPU] Applying ${colormap} colormap [${minValue}, ${maxValue}]`);

  // Load the colormap atlas (cached if already loaded)
  const atlasTexture = gpu.getOrCreateTexture(
    'colormaps_atlas',
    '/colormap_atlas.png',
    { colorSpace: 'srgb', filtering: 'linear', wrapping: 'clamp', generateMipmaps: false }
  );

  // Create colormap node using the atlas
  const colormapNode = createColormapNodeWithAtlas(
    scalarStorage,
    atlasTexture,
    colormap,
    minValue,
    maxValue
  );

  // Update material
  const material = mesh.material as THREE.MeshStandardNodeMaterial;
  material.colorNode = colormapNode;
  material.needsUpdate = true;
}

/**
 * ATLAS TEXTURE FORMAT
 * ====================
 * 
 * The colormap_atlas.png should be organized as:
 * - Width: 256 pixels (0-255 for scalar values)
 * - Height: 8 rows * N pixels per row (one row per colormap)
 * - Format: RGBA PNG
 * 
 * Colormap order (top to bottom):
 * 0: viridis
 * 1: plasma
 * 2: inferno
 * 3: magma
 * 4: cividis
 * 5: turbo
 * 6: coolwarm
 * 7: grayscale
 * 
 * UV Mapping:
 * - U coordinate: normalized scalar value [0, 1]
 * - V coordinate: colormap_index / total_colormaps
 */

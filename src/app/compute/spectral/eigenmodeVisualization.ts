/**
 * eigenmodeVisualization.ts
 * 
 * Simple eigenmode visualization - eigenvectors are scalar fields!
 * Each eigenvector has nV scalar values (one per vertex).
 * 
 * Based on the pattern from BASIC_EIGENMODE_VIS.md:
 * 1. Upload eigenvector as 1D DataTexture
 * 2. Use vertexId attribute to sample texture
 * 3. Normalize and apply colormap
 */

import * as THREE from 'three/webgpu';
import { texture, attribute, float, vec2, vec3, clamp, Fn } from 'three/tsl';
import type { ColormapType } from '../../tsl/colormap';
import type { GPUResourceManager } from '../../gpu/GPUResourceManager';
import type { Manifold } from '../../manifold/Manifold';

/**
 * Simple viridis colormap approximation (polynomial fit)
 * This is a standalone TSL function for eigenmode visualization
 * For production use, consider using the atlas-based colormap from tsl/colormap.ts
 */
const viridisColor = Fn(([t_in]: [any]) => {
  const t = clamp(t_in, 0.0, 1.0);
  
  // Viridis RGB polynomial approximations
  const r = float(0.267).add(t.mul(1.533)).sub(t.mul(t).mul(1.761)).add(t.mul(t).mul(t).mul(0.733));
  const g = float(0.004).add(t.mul(1.385)).sub(t.mul(t).mul(0.897)).add(t.mul(t).mul(t).mul(0.261));
  const b = float(0.329).add(t.mul(1.191)).add(t.mul(t).mul(2.082)).sub(t.mul(t).mul(t).mul(2.374));
  
  return vec3(r, g, b).clamp(0.0, 1.0);
});

export interface EigenmodeVisualizationParams {
  modeIndex: number;      // Which eigenmode to visualize (0-based)
  colormapType: ColormapType; // Which colormap to use
  amplitude: number;      // Amplitude multiplier (default: 1.0)
}

/**
 * Initialize eigenmode visualization for a manifold
 * Uploads eigenvectors to GPU and returns a material node
 */
export async function initEigenmodeVisualization(
  manifold: Manifold,
  gpuManager: GPUResourceManager,
  initialModeIndex: number = 0
): Promise<{
  material: THREE.MeshStandardNodeMaterial;
  setParams: (params: Partial<EigenmodeVisualizationParams>) => void;
  dispose: () => void;
}> {
  if (!manifold.eigenmodes) {
    throw new Error('Manifold does not have eigenmodes');
  }

  const { eigenfunctions, eigenvalues, K } = manifold.eigenmodes;
  const nV = manifold.nV;
  // Extract ONE eigenmode (column-major: eigenfunctions[v + nV*k])
  const extractEigenmode = (k: number): Float32Array => {
    const modeData = new Float32Array(nV);
    for (let v = 0; v < nV; v++) {
      modeData[v] = eigenfunctions[v + nV * k];
    }
    return modeData;
  };

  // Compute min/max for normalization
  const computeMinMax = (data: Float32Array): [number, number] => {
    let vmin = Infinity;
    let vmax = -Infinity;
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      if (v < vmin) vmin = v;
      if (v > vmax) vmax = v;
    }
    return [vmin, vmax];
  };

  // Get initial mode
  const currentModeData = extractEigenmode(initialModeIndex);
  const [vmin, vmax] = computeMinMax(currentModeData);
  const denom = Math.max(vmax - vmin, 1e-12);

  // Reshape to 2D texture to avoid maxTextureDimension2D limit (8192)
  // Choose width that divides nV reasonably or use a fixed width
  const texWidth = Math.min(2048, nV); // Max 2048 width
  const texHeight = Math.ceil(nV / texWidth);
  const texSize = texWidth * texHeight;
  // Upload eigenvector as 2D texture (texWidth × texHeight)
  // Store as RGBA, value in R channel, pad with zeros if needed
  const evRGBA = new Float32Array(texSize * 4);
  for (let i = 0; i < nV; i++) {
    evRGBA[4 * i + 0] = currentModeData[i];
    evRGBA[4 * i + 1] = 0;
    evRGBA[4 * i + 2] = 0;
    evRGBA[4 * i + 3] = 1;
  }
  // Pad remaining pixels with zeros
  for (let i = nV; i < texSize; i++) {
    evRGBA[4 * i + 0] = 0;
    evRGBA[4 * i + 1] = 0;
    evRGBA[4 * i + 2] = 0;
    evRGBA[4 * i + 3] = 1;
  }
  
  const evTex = new THREE.DataTexture(evRGBA, texWidth, texHeight, THREE.RGBAFormat, THREE.FloatType);
  evTex.needsUpdate = true;
  evTex.magFilter = THREE.NearestFilter;
  evTex.minFilter = THREE.NearestFilter;
  evTex.wrapS = THREE.ClampToEdgeWrapping;
  evTex.wrapT = THREE.ClampToEdgeWrapping;

  // Create material
  const material = new THREE.MeshStandardNodeMaterial({
    roughness: 0.5,
    metalness: 0.1,
    flatShading: false
  });

  // Build color node - convert vertexId to 2D texture coordinates
  const vid = attribute('vertexId', 'float');
  
  // Convert 1D vertexId to 2D texture coordinates
  // x = (vertexId % texWidth + 0.5) / texWidth
  // y = (floor(vertexId / texWidth) + 0.5) / texHeight
  const x = vid.mod(float(texWidth)).add(0.5).div(float(texWidth));
  const y = vid.div(float(texWidth)).floor().add(0.5).div(float(texHeight));
  const uv = vec2(x, y);
  
  // Sample eigenvector texture
  const evSample = texture(evTex, uv).r;
  
  // Normalize to [0, 1]
  const tNorm = clamp(
    evSample.sub(float(vmin)).div(float(denom)),
    0.0,
    1.0
  );
  
  // Apply viridis colormap
  const rgb = viridisColor(tNorm);
  
  material.colorNode = rgb;

  // Parameter setter
  let currentModeIndex = initialModeIndex;
  let currentMin = vmin;
  let currentMax = vmax;
  
  const setParams = (params: Partial<EigenmodeVisualizationParams>) => {
    if (params.modeIndex !== undefined && params.modeIndex !== currentModeIndex) {
      if (params.modeIndex < 0 || params.modeIndex >= K) {
        params.modeIndex = Math.max(0, Math.min(K - 1, params.modeIndex));
      }
      
      // Extract new eigenmode data
      const newModeData = extractEigenmode(params.modeIndex);
      const [newMin, newMax] = computeMinMax(newModeData);
      const newDenom = Math.max(newMax - newMin, 1e-12);
      
      // Update texture (respecting 2D layout)
      for (let i = 0; i < nV; i++) {
        evRGBA[4 * i + 0] = newModeData[i];
      }
      evTex.needsUpdate = true;
      
      // Update normalization constants (need to rebuild material for this)
      // For now, just update the texture
      currentModeIndex = params.modeIndex;
      currentMin = newMin;
      currentMax = newMax;
    }

    if (params.amplitude !== undefined) {
    }
  };

  // Set initial mode
  // Disposal
  const dispose = () => {
    evTex.dispose();
    material.dispose();
  };
  return {
    material,
    setParams,
    dispose
  };
}

/**
 * Add vertexId attribute to geometry (REQUIRED for texture sampling)
 */
export function addVertexIdAttribute(geometry: THREE.BufferGeometry): void {
  // Check if already exists
  if (geometry.hasAttribute('vertexId')) {
    return;
  }

  const N = geometry.attributes.position.count;
  const vertexId = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    vertexId[i] = i;
  }
  
  geometry.setAttribute('vertexId', new THREE.BufferAttribute(vertexId, 1));
}

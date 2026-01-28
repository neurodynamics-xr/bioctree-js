/**
 * scalarMapper.js
 * 
 * Scalar field visualization using vertex colors and colormap lookup tables.
 * 
 * Responsibilities:
 * - Map scalar values to vertex colors using colormaps
 * - Manage colormap lookup tables (LUTs)
 * - Update geometry color attributes
 * - Handle color range normalization
 * 
 * Based on Three.js Lut (Lookup Table) pattern for vertex color visualization.
 */

import * as THREE from 'three';
import { createColormap } from './colormaps.js';

/**
 * ScalarMapper - Maps scalar data to vertex colors
 */
export class ScalarMapper {
  constructor() {
    // Current colormap configuration
    this.colormapName = 'viridis';
    this.colormap = null;
    this.clim = [0, 1];
    
    // Cached color object (reused for performance)
    this.colorCache = new THREE.Color();
    
    // Initialize default colormap
    this.setColormap('viridis');
  }

  /**
   * Set the colormap
   * @param {string} name - Colormap name
   */
  setColormap(name) {
    this.colormapName = name;
    this.colormap = createColormap(name);
  }

  /**
   * Set color limits (data range)
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   */
  setClim(min, max) {
    this.clim = [min, max];
  }

  /**
   * Get color for a scalar value
   * @param {number} value - Scalar value
   * @returns {THREE.Color} Color for this value
   */
  getColor(value) {
    // Normalize value to [0, 1]
    const [min, max] = this.clim;
    const range = max - min;
    
    if (range === 0) {
      // Avoid division by zero
      return this.colormap[Math.floor(this.colormap.length / 2)].clone();
    }
    
    const normalized = Math.max(0, Math.min(1, (value - min) / range));
    
    // Map to colormap index
    const index = Math.floor(normalized * (this.colormap.length - 1));
    
    return this.colormap[index].clone();
  }

  /**
   * Apply scalar data to mesh geometry as vertex colors
   * @param {THREE.Mesh} mesh - Target mesh
   * @param {Float32Array | Array} scalarData - Scalar values (one per vertex)
   * @param {Object} options - Configuration options
   * @param {string} [options.colormap='viridis'] - Colormap name
   * @param {Array} [options.clim] - [min, max] color limits
   */
  applyToMesh(mesh, scalarData, options = {}) {
    const geometry = mesh.geometry;
    
    if (!geometry) {
      console.error('[ScalarMapper] Mesh has no geometry');
      return;
    }

    const numVertices = geometry.attributes.position.count;
    
    if (scalarData.length !== numVertices) {
      console.error(`[ScalarMapper] Scalar data length (${scalarData.length}) does not match vertex count (${numVertices})`);
      return;
    }

    // Update colormap if specified
    if (options.colormap && options.colormap !== this.colormapName) {
      this.setColormap(options.colormap);
    }

    // Update color limits if specified
    if (options.clim) {
      this.setClim(options.clim[0], options.clim[1]);
    } else {
      // Auto-compute from data
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < scalarData.length; i++) {
        if (scalarData[i] < min) min = scalarData[i];
        if (scalarData[i] > max) max = scalarData[i];
      }
      this.setClim(min, max);
    }

    // Create or get color attribute
    let colors = geometry.attributes.color;
    
    if (!colors) {
      // Create new color attribute
      const colorArray = new Float32Array(numVertices * 3);
      colors = new THREE.BufferAttribute(colorArray, 3);
      geometry.setAttribute('color', colors);
    }

    // Map scalar values to colors
    const t0 = performance.now();
    
    for (let i = 0; i < numVertices; i++) {
      const value = scalarData[i];
      const color = this.getColor(value);
      
      // Convert to linear color space for rendering
      color.convertSRGBToLinear();
      
      // Set RGB values
      colors.setXYZ(i, color.r, color.g, color.b);
    }

    // Mark for update
    colors.needsUpdate = true;
    
    const t1 = performance.now();

    // Ensure material uses vertex colors with smooth shading
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(mat => {
          mat.vertexColors = true;
          mat.flatShading = false; // Enable smooth interpolation across triangles
          mat.needsUpdate = true;
        });
      } else {
        mesh.material.vertexColors = true;
        mesh.material.flatShading = false; // Enable smooth interpolation across triangles
        mesh.material.needsUpdate = true;
      }
    }
    
    console.log(`[ScalarMapper] Applied vertex colors to mesh (flatShading: false, vertexColors: true)`);
  }

  /**
   * Clear vertex colors from mesh (reset to white)
   * @param {THREE.Mesh} mesh - Target mesh
   */
  clearFromMesh(mesh) {
    const geometry = mesh.geometry;
    
    if (!geometry) return;

    const colors = geometry.attributes.color;
    
    if (!colors) return;

    const numVertices = geometry.attributes.position.count;
    
    // Set all colors to white
    for (let i = 0; i < numVertices; i++) {
      colors.setXYZ(i, 1, 1, 1);
    }

    colors.needsUpdate = true;

    // Disable vertex colors in material
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(mat => {
          mat.vertexColors = false;
          mat.needsUpdate = true;
        });
      } else {
        mesh.material.vertexColors = false;
        mesh.material.needsUpdate = true;
      }
    }
  }
}

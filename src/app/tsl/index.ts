/**
 * tsl/index.ts
 * 
 * Entry point for TSL shader-graph building blocks.
 * 
 * This module exports reusable TSL (Three.js Shading Language) functions
 * that can be composed into materials or compute shaders. These are pure
 * shader-graph nodes with no coupling to viewer components or GPU resources.
 * 
 * Organization:
 * - colormap.ts - Color mapping and visualization
 * - (future) math.ts - Common mathematical operations
 * - (future) noise.ts - Noise functions (Perlin, simplex, etc.)
 * - (future) geometry.ts - Geometric operations (normals, tangents, etc.)
 */

export * from './colormap';

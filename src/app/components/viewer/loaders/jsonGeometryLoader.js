/**
 * jsonGeometryLoader.js
 * 
 * Custom loader for raw scientific geometry JSON data.
 * Does NOT use three.js ObjectLoader/BufferGeometryLoader/GLTF - 
 * builds BufferGeometry explicitly from raw data.
 * 
 * Expected JSON format:
 * {
 *   vertices: Float32Array or number[] (flat array, 3 components per vertex),
 *   faces: Uint32Array or number[] (flat array, indices),
 *   uv: Float32Array or number[] (optional, 2 components per vertex),
 *   meta: {} (optional metadata)
 * }
 */

import * as THREE from 'three';

/**
 * Load geometry from JSON URL
 * @param {string} url - Path to JSON geometry file
 * @returns {Promise<THREE.BufferGeometry>} Constructed BufferGeometry
 */
export async function loadJSONGeometry(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load geometry JSON: ${url}`);
  }

  const data = await response.json();

  return buildGeometryFromData(data);
}

/**
 * Build BufferGeometry from raw data object
 * @param {Object} data - Geometry data object
 * @param {Array|TypedArray} data.vertices - Vertex positions (flat, 3 components)
 * @param {Array|TypedArray} data.faces - Face indices (flat)
 * @param {Array|TypedArray} [data.uv] - UV coordinates (flat, 2 components)
 * @param {Object} [data.meta] - Optional metadata
 * @returns {THREE.BufferGeometry} Constructed BufferGeometry
 */
export function buildGeometryFromData(data) {
  // --- Basic validation ---
  if (!data.vertices || !data.faces) {
    throw new Error('Invalid geometry JSON: missing vertices or faces');
  }

  const geometry = new THREE.BufferGeometry();

  // Positions
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(data.vertices, 3)
  );

  // Indices
  geometry.setIndex(data.faces);

  // UVs (optional)
  if (data.uv) {
    geometry.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(data.uv, 2)
    );
  }

  // Normals (compute from geometry)
  geometry.computeVertexNormals();

  // Metadata (keep it attached for debugging / logic)
  geometry.userData.meta = data.meta ?? {};

  return geometry;
}

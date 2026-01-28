/**
 * normals.js
 * 
 * Optional geometric computation utilities for normals, UVs, and tangents.
 * These functions are NOT used in the standard rendering pipeline.
 * The bct.ui.manifold viewer expects pre-computed attributes from MATLAB.
 * 
 * This module exists for:
 * - Testing/debugging purposes
 * - Future standalone web demos
 * - Reference implementations
 * 
 * DO NOT call these functions from meshBuilder or the standard loading pipeline.
 */

import * as THREE from 'three';

/**
 * Compute vertex normals for a geometry
 * @param {THREE.BufferGeometry} geometry - Geometry to compute normals for
 * @returns {THREE.BufferGeometry} The same geometry with computed normals
 */
export function computeVertexNormals(geometry) {
  geometry.computeVertexNormals();
  
  if (geometry.attributes.normal) {
    geometry.attributes.normal.needsUpdate = true;
  }
  
  return geometry;
}

/**
 * Synthesize spherical UVs for a geometry if UVs are missing.
 * Uses bounding sphere center for stable parameterization.
 * 
 * @param {THREE.BufferGeometry} geometry - Geometry to add UVs to
 * @returns {THREE.BufferGeometry} The same geometry with synthesized UVs
 */
export function synthesizeSphericalUVs(geometry) {
  const t0 = performance.now();
  const pos = geometry.attributes.position;
  if (!pos) {
    console.warn('[normals] Cannot synthesize UVs: missing positions');
    return geometry;
  }

  // Use bounding sphere center for stable parameterization
  geometry.computeBoundingSphere();
  const c = geometry.boundingSphere?.center ?? new THREE.Vector3();

  const uvs = new Float32Array(pos.count * 2);
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).sub(c).normalize();

    // longitude/latitude on unit sphere
    const lon = Math.atan2(v.z, v.x);  // [-pi, pi]
    const lat = Math.asin(v.y);        // [-pi/2, pi/2]

    const u = (lon + Math.PI) / (2 * Math.PI);
    const t = (lat + Math.PI / 2) / Math.PI;

    uvs[2 * i + 0] = u;
    uvs[2 * i + 1] = t;
  }

  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.attributes.uv.needsUpdate = true;
  
  return geometry;
}

/**
 * Compute tangents for a geometry
 * Requires: index, position, normal, and uv attributes
 * 
 * @param {THREE.BufferGeometry} geometry - Geometry to compute tangents for
 * @returns {THREE.BufferGeometry} The same geometry with computed tangents
 */
export function computeTangents(geometry) {
  const hasRequiredAttrs = 
    geometry.index && 
    geometry.attributes.position && 
    geometry.attributes.normal && 
    geometry.attributes.uv;
  
  if (!hasRequiredAttrs) {
    console.warn('[normals] Cannot compute tangents: missing required attributes');
    return geometry;
  }
  
  try {
    geometry.computeTangents();
  } catch (err) {
    console.warn('[normals] Failed to compute tangents:', err.message);
  }
  
  return geometry;
}

/**
 * Compute all optional attributes (normals, UVs, tangents)
 * This is a convenience function for testing/debugging.
 * DO NOT use in the standard rendering pipeline.
 * 
 * @param {THREE.BufferGeometry} geometry - Geometry to process
 * @returns {Object} Status object with flags
 */
export function computeAllAttributes(geometry) {
  const status = {
    hasNormals: false,
    hasUVs: false,
    hasTangents: false
  };

  if (!geometry) return status;

  console.warn('[normals] computeAllAttributes: This should only be used for testing!');

  // Compute normals if missing
  if (!geometry.attributes.normal) {
    computeVertexNormals(geometry);
  }
  status.hasNormals = !!geometry.attributes.normal;

  // Synthesize UVs if missing
  if (!geometry.attributes.uv) {
    synthesizeSphericalUVs(geometry);
  }
  status.hasUVs = !!geometry.attributes.uv;

  // Compute tangents if possible
  if (!geometry.attributes.tangent) {
    computeTangents(geometry);
  }
  status.hasTangents = !!geometry.attributes.tangent;

  return status;
}

/**
 * meshBuilder.js
 * 
 * Geometry construction utilities for BufferGeometry creation and validation.
 * 
 * IMPORTANT: This module does NOT compute normals, UVs, or tangents.
 * All geometric attributes must be provided by MATLAB (bct package).
 * 
 * Responsibilities:
 * - Validate geometry attributes
 * - Report missing attributes (without computing them)
 * - Geometry downsampling for helper visualization
 * - Mesh transformation utilities
 * 
 * Rules:
 * - No material creation
 * - No scene modification
 * - No expensive computations (normals, UVs, tangents)
 * - Pure geometry operations only
 */

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Validate geometry attributes without computing them.
 * Reports which attributes are present but does NOT create missing ones.
 * EXCEPTION: Ensures geometry is indexed (required for geodesic processing)
 * 
 * @param {THREE.BufferGeometry} geometry - Geometry to validate
 * @returns {Object} Status object with flags: { hasPosition, hasNormals, hasUVs, hasTangents, isIndexed }
 */
export function validateGeometryAttributes(geometry) {
  const status = {
    hasPosition: false,
    hasNormals: false,
    hasUVs: false,
    hasTangents: false,
    isIndexed: false
  };

  if (!geometry) {
    console.warn('[meshBuilder] Cannot validate: geometry is null');
    return status;
  }

  // Check which attributes exist
  status.hasPosition = !!geometry.attributes.position;
  status.hasNormals = !!geometry.attributes.normal;
  status.hasUVs = !!geometry.attributes.uv;
  status.hasTangents = !!geometry.attributes.tangent;
  status.isIndexed = !!geometry.index;

  // CRITICAL: Ensure geometry is indexed (required for geodesic processing)
  // OBJ files loaded by OBJLoader are often non-indexed
  if (!status.isIndexed && status.hasPosition) {
    console.warn('[meshBuilder] Geometry not indexed - converting (required for geodesic features)');
    const originalVertexCount = geometry.attributes.position.count;
    
    try {
      // mergeVertices creates an indexed geometry by merging duplicate vertices
      // Use tighter tolerance (1e-6) to avoid over-merging that could create non-manifold topology
      const indexedGeometry = mergeVertices(geometry, 1e-6);
      
      // Copy indexed data back to original geometry
      geometry.setIndex(indexedGeometry.index);
      geometry.setAttribute('position', indexedGeometry.attributes.position);
      
      // Copy other attributes if they exist
      if (indexedGeometry.attributes.normal) {
        geometry.setAttribute('normal', indexedGeometry.attributes.normal);
      }
      if (indexedGeometry.attributes.uv) {
        geometry.setAttribute('uv', indexedGeometry.attributes.uv);
      }
      if (indexedGeometry.attributes.color) {
        geometry.setAttribute('color', indexedGeometry.attributes.color);
      }
      
      const mergedVertexCount = geometry.attributes.position.count;
      const mergedPercent = ((1 - mergedVertexCount / originalVertexCount) * 100).toFixed(1);
      
      status.isIndexed = true;
      console.log(`[meshBuilder] Geometry indexed: ${originalVertexCount} → ${mergedVertexCount} vertices (${mergedPercent}% reduction)`);
    } catch (error) {
      console.error('[meshBuilder] Failed to index geometry:', error);
    }
  }

  // TEMPORARY: Compute normals if missing (required for MeshStandardMaterial)
  // TODO: Remove this once MATLAB consistently provides pre-computed normals
  if (!status.hasNormals && status.hasPosition) {
    console.warn('[meshBuilder] WARNING: Normals missing, computing fallback (use Manifold.normals() in MATLAB!)');
    geometry.computeVertexNormals();
    status.hasNormals = !!geometry.attributes.normal;
  }

  // Log critical missing attributes
  if (!status.hasNormals) {
    console.warn('[meshBuilder] Geometry missing normals (required for MeshStandardMaterial)');
  }

  return status;
}

/**
 * @deprecated Use validateGeometryAttributes instead
 * Legacy function kept for compatibility. Does NOT compute attributes.
 */
export function ensureGeometryAttributes(geometry) {
  console.warn('[meshBuilder] ensureGeometryAttributes is deprecated. Attributes are not computed.');
  return validateGeometryAttributes(geometry);
}

/**
 * Create a downsampled copy of a geometry for helper visualization.
 * Downsamples positions, normals, and optionally tangents.
 * 
 * @param {THREE.BufferGeometry} geometry - Source geometry
 * @param {number} downsampleFactor - Factor to downsample by (e.g., 100 = every 100th vertex)
 * @param {boolean} includeTangents - Whether to include tangent attribute
 * @returns {THREE.BufferGeometry|null} Downsampled geometry or null if invalid
 */
export function createDownsampledGeometry(geometry, downsampleFactor = 1, includeTangents = false) {
  if (!geometry) return null;

  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  
  if (!positions || !normals) {
    console.warn('[meshBuilder] Cannot downsample: missing positions or normals');
    return null;
  }

  const downsampledPositions = [];
  const downsampledNormals = [];
  const downsampledTangents = includeTangents ? [] : null;

  // Check if tangents are available when requested
  const tangents = includeTangents ? geometry.attributes.tangent : null;
  if (includeTangents && !tangents) {
    console.warn('[meshBuilder] Tangents requested but not available');
    return null;
  }

  // Downsample attributes
  for (let i = 0; i < positions.count; i += downsampleFactor) {
    downsampledPositions.push(
      positions.getX(i),
      positions.getY(i),
      positions.getZ(i)
    );
    downsampledNormals.push(
      normals.getX(i),
      normals.getY(i),
      normals.getZ(i)
    );
    
    if (includeTangents && tangents) {
      downsampledTangents.push(
        tangents.getX(i),
        tangents.getY(i),
        tangents.getZ(i),
        tangents.getW(i)
      );
    }
  }

  // Create sparse geometry
  const sparseGeometry = new THREE.BufferGeometry();
  sparseGeometry.setAttribute('position', new THREE.Float32BufferAttribute(downsampledPositions, 3));
  sparseGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(downsampledNormals, 3));
  
  if (includeTangents && downsampledTangents) {
    sparseGeometry.setAttribute('tangent', new THREE.Float32BufferAttribute(downsampledTangents, 4));
  }

  return sparseGeometry;
}

/**
 * Create a temporary mesh with world transforms copied from a source mesh.
 * Useful for creating helper visualization meshes that match source transforms.
 * 
 * @param {THREE.BufferGeometry} geometry - Geometry for the mesh
 * @param {THREE.Mesh} sourceMesh - Source mesh to copy transforms from
 * @returns {THREE.Mesh} Temporary mesh with copied transforms
 */
export function createTransformedMesh(geometry, sourceMesh) {
  const tempMesh = new THREE.Mesh(geometry, sourceMesh.material);
  tempMesh.position.copy(sourceMesh.position);
  tempMesh.rotation.copy(sourceMesh.rotation);
  tempMesh.scale.copy(sourceMesh.scale);
  tempMesh.matrixWorld.copy(sourceMesh.matrixWorld);
  return tempMesh;
}

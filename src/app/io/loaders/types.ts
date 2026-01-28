/**
 * Common types for data loading across the application
 */

import type * as THREE from 'three';

/**
 * Supported manifold file formats
 */
export type ManifoldFormat = 'glb' | 'gltf' | 'obj' | 'json' | 'zarr';

/**
 * Supported field file formats
 */
export type FieldFormat = 'json' | 'bin';

/**
 * Supported BCT (manifold operator) file formats
 */
export type BCTFormat = 'json+bin'; // Manifest + binary data

/**
 * Raw manifold geometry data (before Three.js conversion)
 */
export interface RawManifoldData {
  vertices: Float32Array;     // [x,y,z, x,y,z, ...]
  faces: Uint32Array;          // [i0,i1,i2, i0,i1,i2, ...]
  normals?: Float32Array;      // Optional vertex normals
  uvs?: Float32Array;          // Optional texture coordinates
  indexBase?: 0 | 1;           // 0-based or 1-based indexing
  coordinateFrame?: 'threejs' | 'matlab'; // Y-up or Z-up
}

/**
 * Loaded manifold with Three.js geometry
 */
export interface ManifoldData {
  format: ManifoldFormat;
  source: string;              // URL or filename
  geometry?: THREE.BufferGeometry;
  scene?: THREE.Group;         // For GLB/GLTF with scene graph
  statistics: {
    vertexCount: number;
    faceCount: number;
    bounds?: {
      min: THREE.Vector3;
      max: THREE.Vector3;
    };
  };
  metadata?: Record<string, any>;
}

/**
 * Scalar field data
 */
export interface ScalarFieldData {
  name: string;
  values: Float32Array;        // One value per vertex
  vertexCount: number;
  range: [number, number];     // [min, max]
  colormap?: string;           // Optional default colormap
  metadata?: Record<string, any>;
}

/**
 * Vector field data
 */
export interface VectorFieldData {
  name: string;
  vectors: Float32Array;       // [vx,vy,vz, vx,vy,vz, ...]
  vertexCount: number;
  magnitude?: Float32Array;    // Optional precomputed magnitudes
  metadata?: Record<string, any>;
}

/**
 * BCT Spectral data (eigenmodes, gradient basis, etc.)
 */
export interface BCTSpectralData {
  schema: string;
  version: string;
  
  // Manifold topology
  nV: number;                  // Number of vertices
  nF: number;                  // Number of faces
  K: number;                   // Number of eigenmodes
  
  // Geometry buffers
  vertices: Float32Array;      // [nV, 3]
  faces: Uint32Array;          // [nF, 3]
  centroids: Float32Array;     // [nF, 3] face centroids
  faceNormals: Float32Array;   // [nF, 3] face normals
  
  // Topology buffers
  faceNeighbors: Int32Array;   // [nF, 3] neighbor indices (-1 = boundary)
  neighborEdge: Uint8Array;    // [nF, 3] edge correspondence
  
  // Spectral basis
  lambda: Float32Array;        // [K] eigenvalues
  psi: Float32Array;           // [K, nV] eigenvectors (row-major)
  gradPsi: Float32Array;       // [3, K, nF] gradient basis (row-major)
  massV: Float32Array;         // [nV] vertex masses
  
  // Layout conventions
  layouts: {
    psi: string;               // "K_nV" (row-major indexing)
    gradPsi: string;           // "C_K_nF" (row-major indexing)
  };
  
  // Flags
  flags: {
    has_boundary: boolean;
  };
  
  metadata?: Record<string, any>;
}

/**
 * BCT package (can contain spectral data, fields, etc.)
 */
export interface BCTPackage {
  type: 'spectral' | 'operators' | 'fields';
  manifoldId?: string;         // Associated manifold identifier
  spectral?: BCTSpectralData;
  fields?: Record<string, ScalarFieldData | VectorFieldData>;
  metadata?: Record<string, any>;
}

/**
 * Loading progress callback
 */
export interface LoadProgress {
  loaded: number;              // Bytes loaded
  total: number;               // Total bytes
  percentage: number;          // 0-100
}

/**
 * Loading options
 */
export interface LoadOptions {
  onProgress?: (progress: LoadProgress) => void;
  onError?: (error: Error) => void;
  validate?: boolean;          // Run validation after loading (default: true)
  cache?: boolean;             // Cache loaded data (default: false)
}

/**
 * Load result with metadata
 */
export interface LoadResult<T> {
  data: T;
  duration: number;            // Load time in milliseconds
  cached: boolean;             // Whether data was from cache
  warnings?: string[];         // Non-fatal validation warnings
}

/**
 * Zarr coordinate system types
 */
export type ZarrCoordinateSystem = 'RAS' | 'LPS' | 'scanner' | 'unknown';

/**
 * Zarr face winding types
 */
export type ZarrFaceWinding = 'CCW' | 'CW';

/**
 * Zarr metric information
 */
export interface ZarrMetric {
  unit: string;                // 'm', 'mm', 'cm', etc.
  rescale: {
    applied: boolean;
    fromUnit: string;
    factor: number;
    timestamp: string;
  };
}

/**
 * Zarr manifold metadata (from .zattrs)
 */
export interface ZarrManifoldMetadata {
  schema: string;              // 'bct.manifold@1' or 'bct.manifold.h5@1'
  id: string;                  // Unique manifold identifier
  name: string;                // Manifold name
  coordinate_system: ZarrCoordinateSystem;
  face_winding: ZarrFaceWinding;
  normal_convention?: string;  // 'right-hand-rule', etc.
  metric: ZarrMetric;
  source?: string;             // Original file path
  created_at?: string;         // ISO timestamp
  created_by?: string;         // Creator name
  index_base_faces?: number;   // 0 or 1
  index_base_edges?: number;   // 0 or 1
  matlab_index_base?: number;  // Original MATLAB index base
}

/**
 * Zarr store options
 */
export interface ZarrStoreOptions {
  type?: 'http' | 'file';      // Store type
  cache?: boolean;             // Enable caching
  credentials?: RequestCredentials; // For HTTP fetch
}

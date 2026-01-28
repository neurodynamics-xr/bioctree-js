/**
 * zarrLoader.ts
 * 
 * Zarr file loader for BCT manifold data.
 * Loads mesh data from .zarr format and creates Manifold objects.
 * 
 * File format: Zarr v2 group with vertices/faces arrays + metadata
 * Schema: bct.manifold@1 or bct.manifold.h5@1
 * 
 * Key features:
 * - GPU-ready data (Float32 vertices, Uint32 faces, C-order)
 * - 0-based indexing (direct WebGL/WebGPU usage)
 * - Rich metadata (coordinate systems, units, provenance)
 * - HTTP-friendly (cloud/CDN delivery)
 */

import * as zarr from 'zarrita';
import { FetchStore } from 'zarrita';
import { createManifold } from '../../manifold/Manifold';
import { setManifold } from '../../state/manifold';
import type {
  ZarrManifoldMetadata,
  ZarrCoordinateSystem,
  LoadOptions
} from './types';

/**
 * Load Zarr manifold from URL or path and create Manifold object
 * 
 * @param zarrPath - Path to .zarr directory (HTTP URL or local path)
 * @param options - Loading options
 */
export async function loadZarr(
  zarrPath: string,
  options?: {
    setAsCurrent?: boolean;
    name?: string;
    loadOptions?: LoadOptions;
  }
): Promise<void> {
  const {
    setAsCurrent = true,
    name,
    loadOptions = {}
  } = options || {};

  const startTime = performance.now();
  try {
    // Construct full URL for FetchStore (required in browser context)
    const fullUrl = zarrPath.startsWith('http') 
      ? zarrPath 
      : new URL(zarrPath, window.location.origin).href;
    // Open Zarr store
    const store = new FetchStore(fullUrl);
    const loc = zarr.root(store);

    // Open root group to access metadata
    const rootGroup = await zarr.open(loc, { kind: 'group' });
    const rootAttrs = rootGroup.attrs;
    // Validate schema
    if (!rootAttrs || !rootAttrs.schema) {
    }

    // Open manifold group
    const manifoldLoc = loc.resolve('manifold');
    const manifoldGroup = await zarr.open(manifoldLoc, { kind: 'group' });
    const manifoldAttrs = manifoldGroup.attrs as unknown as ZarrManifoldMetadata;
    
    if (!manifoldAttrs) {
      throw new Error('Missing manifold group or metadata');
    }
    // Validate BCT schema
    validateSchema(manifoldAttrs);

    // Load vertices
    const vertices = await loadVertices(loc);
    // Load faces
    const faces = await loadFaces(loc, vertices.length / 3);
    // Load edges (optional, for wireframe)
    let edges: Uint32Array | undefined;
    try {
      edges = await loadEdges(loc);
    } catch (error) {
    }

    // Note: Coordinate transforms disabled for now - load vertices as-is
    // Coordinate system: ${manifoldAttrs.coordinate_system}
    // Metric: ${manifoldAttrs.metric.unit}

    // Create Manifold object with original vertices (no transform)
    const manifoldName = name || manifoldAttrs.name || zarrPath.split('/').pop()?.replace('.zarr', '') || 'Unnamed';
    
    const manifold = createManifold(vertices, faces, {
      name: manifoldName,
      source: zarrPath,
      description: `Zarr manifold (${manifoldAttrs.coordinate_system}, ${manifoldAttrs.metric.unit})`,
      // transform: undefined, // Transforms disabled
      topology: edges ? {
        edges,
        nE: edges.length / 2
      } : undefined
    });

    const duration = performance.now() - startTime;
    // Set as current manifold in app state
    if (setAsCurrent) {
      setManifold(manifold);
    }

  } catch (error) {
    // Try to diagnose the issue
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
    }
    
    if (loadOptions.onError) {
      loadOptions.onError(error as Error);
    }
    throw error;
  }
}

/**
 * Load vertices from Zarr store
 */
async function loadVertices(rootLoc: zarr.Location<FetchStore>): Promise<Float32Array> {
  try {
    const verticesLoc = rootLoc.resolve('manifold/vertices');
    const verticesArray = await zarr.open(verticesLoc, { kind: 'array' });

    // Validate metadata
    const shape = verticesArray.shape;
    const dtype = verticesArray.dtype;
    // Validate dtype (should be float32)
    if (!dtype.includes('float32') && !dtype.includes('<f4') && !dtype.includes('>f4')) {
    }

    // Load data - zarrita returns ndarray object with .data property
    const verticesNdarray = await zarr.get(verticesArray);
    const verticesData = (verticesNdarray as any).data;

    // Ensure Float32Array
    if (!(verticesData instanceof Float32Array)) {
      return new Float32Array(verticesData as ArrayLike<number>);
    }

    return verticesData as Float32Array;
  } catch (error) {
    throw new Error(`Failed to load vertices: ${error}`);
  }
}

/**
 * Load faces from Zarr store
 */
async function loadFaces(rootLoc: zarr.Location<FetchStore>, vertexCount: number): Promise<Uint32Array> {
  try {
    const facesLoc = rootLoc.resolve('manifold/faces');
    const facesArray = await zarr.open(facesLoc, { kind: 'array' });

    // Validate metadata
    const shape = facesArray.shape;
    const dtype = facesArray.dtype;
    // Note: Zarr may use int32 or uint32 - both are fine, we convert to Uint32Array

    // Load data - zarrita returns ndarray object with .data property
    const facesNdarray = await zarr.get(facesArray);
    const facesData = (facesNdarray as any).data;

    // Ensure Uint32Array
    let facesTyped: Uint32Array;
    if (!(facesData instanceof Uint32Array)) {
      facesTyped = new Uint32Array(facesData as ArrayLike<number>);
    } else {
      facesTyped = facesData as Uint32Array;
    }

    // Validate index bounds
    const maxIndex = Math.max(...Array.from(facesTyped));
    if (maxIndex >= vertexCount) {
      throw new Error(
        `Invalid face index: ${maxIndex} >= ${vertexCount} (vertex count)`
      );
    }

    return facesTyped;
  } catch (error) {
    throw new Error(`Failed to load faces: ${error}`);
  }
}

/**
 * Load edges from Zarr store (optional)
 */
async function loadEdges(rootLoc: zarr.Location<FetchStore>): Promise<Uint32Array> {
  const edgesLoc = rootLoc.resolve('manifold/edges');
  const edgesArray = await zarr.open(edgesLoc, { kind: 'array' });

  const edgesNdarray = await zarr.get(edgesArray);
  const edgesData = (edgesNdarray as any).data;

  // Ensure Uint32Array
  if (!(edgesData instanceof Uint32Array)) {
    return new Uint32Array(edgesData as ArrayLike<number>);
  }

  return edgesData as Uint32Array;
}

/**
 * Validate BCT schema version
 */
function validateSchema(metadata: ZarrManifoldMetadata): void {
  if (!metadata.schema) {
    throw new Error('Missing schema field in manifold metadata');
  }

  const validSchemas = ['bct.manifold@1', 'bct.manifold.h5@1'];
  if (!validSchemas.includes(metadata.schema)) {
  }

  // Validate required fields
  if (!metadata.id) {
  }
  if (!metadata.name) {
  }
  if (!metadata.coordinate_system) {
  }
  if (!metadata.face_winding) {
  }
}

/**
 * Note: Coordinate transforms are disabled.
 * Vertices are loaded as-is from Zarr files.
 * Transform implementation will be added later.
 */

// Removed deprecated coordinate transform functions:
// - applyCoordinateTransform() - DELETED
// - applyUnitScaling() - DELETED  
// - createTransformMatrix() - DELETED

/**
 * Load Zarr mesh from public data directory
 * 
 * @param filename - Folder name without .zarr extension (e.g., "bunny")
 * @param options - Loading options
 */
export async function loadZarrFromData(filename: string, options?: {
  setAsCurrent?: boolean;
  name?: string;
}): Promise<void> {
  const zarrPath = `/src/app/data/${filename}.zarr`;
  return loadZarr(zarrPath, options);
}

/**
 * Export utility for direct Zarr metadata access
 */
export async function getZarrMetadata(zarrPath: string): Promise<ZarrManifoldMetadata> {
  const store = new FetchStore(zarrPath);
  const loc = zarr.root(store);
  const manifoldLoc = loc.resolve('manifold');
  const manifoldGroup = await zarr.open(manifoldLoc, { kind: 'group' });
  return manifoldGroup.attrs as unknown as ZarrManifoldMetadata;
}

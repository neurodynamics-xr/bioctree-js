// Minimal manifold loader (Phase 1 & 2)
// Loads vertices, faces, edges, and eigenmodes from BCT Zarr format

import type { Location } from 'zarrita';
import { FetchStore } from 'zarrita';
import { openZarrStore, readArray, readAttrs, checkGroupExists } from './store';
import { loadEigenmodesFromZarr } from './eigenmodes';
import type {
  ZarrManifold,
  BCTManifoldAttrs,
  BCTRootAttrs,
  LoadManifoldOptions,
} from './types';

/**
 * Load a manifold from a BCT Zarr package
 * @param path - Path to .zarr directory (e.g., 'src/app/data/bctbunny.zarr')
 * @param options - Loading options
 * @returns ZarrManifold containing vertices, faces, edges, and metadata
 */
export async function loadManifoldFromZarr(
  path: string,
  options: LoadManifoldOptions = {}
): Promise<ZarrManifold> {
  const { loadEdges = true, loadEigenmodes = true, validateIndices = true } = options;

  // Open the Zarr store
  const rootLoc = await openZarrStore(path);

  // Validate root schema
  const rootAttrs = await readAttrs<BCTRootAttrs>(rootLoc, '.');
  if (!rootAttrs.schema || !rootAttrs.schema.startsWith('bct.manifold')) {
    throw new Error(
      `Invalid BCT schema: expected "bct.manifold@X.Y", got "${rootAttrs.schema}"`
    );
  }

  // Read manifold metadata
  const manifoldAttrs = await readAttrs<BCTManifoldAttrs>(rootLoc, 'manifold');

  // Load core datasets (lowercase paths confirmed by exploration)
  const vertices = await loadVertices(rootLoc);
  const faces = await loadFaces(rootLoc, manifoldAttrs.indexBase || 0);
  const edges = loadEdges ? await loadEdges_(rootLoc, manifoldAttrs.indexBase || 0) : undefined;

  // Load eigenmodes if requested and available
  let eigenmodes = undefined;
  if (loadEigenmodes) {
    const eigenmodesExists = await checkGroupExists(rootLoc, 'manifold/eigenmodes');
    if (eigenmodesExists) {
      try {
        eigenmodes = await loadEigenmodesFromZarr(path);
      } catch (error) {
        // Continue without eigenmodes
      }
    }
  }

  // Validate indices if requested
  if (validateIndices) {
    validateFaceIndices(faces, vertices.length / 3);
    if (edges) {
      validateEdgeIndices(edges, vertices.length / 3);
    }
  }

  return {
    vertices,
    faces,
    edges,
    eigenmodes,
    metadata: manifoldAttrs,
  };
}

/**
 * Load vertices array [N, 3] from manifold/vertices
 * Always returns Float32Array (converts Float64 if needed for GPU compatibility)
 */
async function loadVertices(
  loc: Location<FetchStore>
): Promise<Float32Array> {
  try {
    const verticesRaw = await readArray<Float32Array | Float64Array>(loc, 'manifold/vertices');
    
    // Always convert to Float32Array (WebGPU requires float32 for vertex attributes)
    let vertices: Float32Array;
    if (verticesRaw instanceof Float64Array) {
      vertices = new Float32Array(verticesRaw);
    } else if (verticesRaw instanceof Float32Array) {
      vertices = verticesRaw;
    } else {
      // Fallback for other array-like types
      vertices = new Float32Array(verticesRaw);
    }
    
    // Validate shape (should be [N, 3])
    if (vertices.length % 3 !== 0) {
      throw new Error(
        `Invalid vertices shape: expected [N, 3], got length ${vertices.length}`
      );
    }
    
    return vertices;
  } catch (error) {
    throw new Error(`Failed to load vertices: ${error}`);
  }
}

/**
 * Load faces array [M, 3] from manifold/faces
 */
async function loadFaces(loc: Location<FetchStore>, indexBase: number = 0): Promise<Uint32Array> {
  try {
    const facesRaw = await readArray<Uint32Array>(loc, 'manifold/faces');
    
    // Ensure we have a proper Uint32Array (zarrita might return Int32Array or other types)
    const faces = facesRaw instanceof Uint32Array ? facesRaw : new Uint32Array(facesRaw);
    
    // Validate shape (should be [M, 3])
    if (faces.length % 3 !== 0) {
      throw new Error(
        `Invalid faces shape: expected [M, 3], got length ${faces.length}`
      );
    }
    
    // Convert from 1-based to 0-based indexing if needed (BCT/MATLAB convention)
    if (indexBase === 1) {
      for (let i = 0; i < faces.length; i++) {
        faces[i] -= 1;
      }
    }
    
    return faces;
  } catch (error) {
    throw new Error(`Failed to load faces: ${error}`);
  }
}

/**
 * Load edges array [E, 2] from manifold/edges (optional)
 */
async function loadEdges_(loc: Location<FetchStore>, indexBase: number = 0): Promise<Uint32Array | undefined> {
  try {
    const edges = await readArray<Uint32Array>(loc, 'manifold/edges');
    
    // Validate shape (should be [E, 2])
    if (edges.length % 2 !== 0) {
      throw new Error(
        `Invalid edges shape: expected [E, 2], got length ${edges.length}`
      );
    }
    
    // Convert from 1-based to 0-based indexing if needed (BCT/MATLAB convention)
    if (indexBase === 1) {
      for (let i = 0; i < edges.length; i++) {
        edges[i] -= 1;
      }
    }
    
    return edges;
  } catch (error) {
    return undefined;
  }
}

/**
 * Validate that face indices are within bounds
 */
function validateFaceIndices(faces: Uint32Array, numVertices: number): void {
  for (let i = 0; i < faces.length; i++) {
    if (faces[i] >= numVertices) {
      throw new Error(
        `Face index out of bounds: ${faces[i]} >= ${numVertices} at position ${i}`
      );
    }
  }
}

/**
 * Validate that edge indices are within bounds
 */
function validateEdgeIndices(edges: Uint32Array, numVertices: number): void {
  for (let i = 0; i < edges.length; i++) {
    if (edges[i] >= numVertices) {
      throw new Error(
        `Edge index out of bounds: ${edges[i]} >= ${numVertices} at position ${i}`
      );
    }
  }
}

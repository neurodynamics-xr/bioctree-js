/**
 * bct.ts
 * 
 * BCT (Bioctree) file loader.
 * Loads mesh data and optional spectral data from BCT format files.
 * Creates Manifold objects and updates app state.
 * 
 * File format: JSON manifest + binary data buffer
 */

import { createManifold, type ManifoldEigenmodes, type ManifoldGeometry } from '../../manifold/Manifold';
import { setManifold } from '../../state/manifold';

/**
 * Manifest structure for BCT files
 */
interface BCTManifest {
  schema?: string;
  version?: string;
  nV: number;
  nF: number;
  K?: number;
  vertexCount?: number;
  faceCount?: number;
  eigenvalues?: number;
}

/**
 * Load BCT mesh from files and create Manifold
 * 
 * @param basePath - Base path without extension (e.g., "src/app/data/bct/bunny_spectral")
 * @param options - Loading options
 */
export async function loadBCT(basePath: string, options?: {
  setAsCurrent?: boolean;
  name?: string;
}): Promise<void> {
  const { setAsCurrent = true, name } = options || {};

  const jsonPath = `${basePath}.json`;
  const binPath = `${basePath}.bin`;
  try {
    // Fetch JSON manifest
    const jsonResponse = await fetch(jsonPath);
    if (!jsonResponse.ok) {
      throw new Error(`Failed to load ${jsonPath}: ${jsonResponse.statusText}`);
    }
    const manifest: BCTManifest = await jsonResponse.json();

    // Fetch binary data
    const binResponse = await fetch(binPath);
    if (!binResponse.ok) {
      throw new Error(`Failed to load ${binPath}: ${binResponse.statusText}`);
    }
    const arrayBuffer = await binResponse.arrayBuffer();
    // Parse binary data
    const { vertices, faces, eigenmodes, geometry } = parseBCTBinary(arrayBuffer, manifest);

    // Create Manifold object
    const manifoldName = name || basePath.split('/').pop() || 'Unnamed';
    const manifold = createManifold(vertices, faces, {
      name: manifoldName,
      source: basePath,
      description: eigenmodes ? `BCT with ${eigenmodes.K} eigenmodes` : 'BCT mesh',
      geometry,
      eigenmodes
    });
    // Set as current manifold in app state
    if (setAsCurrent) {
      setManifold(manifold);
    }

  } catch (error) {
    throw error;
  }
}

/**
 * Parse binary data from BCT file
 */
function parseBCTBinary(buffer: ArrayBuffer, manifest: BCTManifest): {
  vertices: Float32Array;
  faces: Uint32Array;
  eigenmodes?: ManifoldEigenmodes;
  geometry?: ManifoldGeometry;
} {
  const nV = manifest.nV || manifest.vertexCount || 0;
  const nF = manifest.nF || manifest.faceCount || 0;
  const K = manifest.K || manifest.eigenvalues || 0;

  if (nV === 0 || nF === 0) {
    throw new Error('Invalid manifest: nV and nF must be > 0');
  }

  let offset = 0;

  // Parse vertices (nV × 3 floats)
  const vertexBytes = nV * 3 * 4;
  const vertices = new Float32Array(buffer, offset, nV * 3);
  offset += vertexBytes;

  // Parse faces (nF × 3 uint32)
  const faceBytes = nF * 3 * 4;
  const faces = new Uint32Array(buffer, offset, nF * 3);
  offset += faceBytes;
  // Parse spectral data if present
  let eigenmodes: ManifoldEigenmodes | undefined;
  let geometry: ManifoldGeometry | undefined;

  if (K > 0 && buffer.byteLength > offset) {
    // Eigenvalues (K floats)
    const eigenvalueBytes = K * 4;
    if (offset + eigenvalueBytes > buffer.byteLength) {
      return { vertices, faces };
    }
    const eigenvalues = new Float32Array(buffer, offset, K);
    offset += eigenvalueBytes;

    // Eigenfunctions (K × nV floats, row-major)
    const eigenfunctionBytes = K * nV * 4;
    if (offset + eigenfunctionBytes > buffer.byteLength) {
      return { vertices, faces };
    }
    const eigenfunctions = new Float32Array(buffer, offset, K * nV);
    offset += eigenfunctionBytes;

    // Vertex masses (nV floats)
    const massBytes = nV * 4;
    let massV: Float32Array | undefined;
    if (offset + massBytes <= buffer.byteLength) {
      massV = new Float32Array(buffer, offset, nV);
      offset += massBytes;

      // Store massV in geometry as well
      geometry = { massV };
    }

    eigenmodes = {
      eigenvalues,
      eigenfunctions,
      K,
      massV
    };
  }

  return {
    vertices,
    faces,
    eigenmodes,
    geometry
  };
}

/**
 * Load BCT mesh from public data directory
 * 
 * @param filename - Filename without extension (e.g., "bunny_spectral")
 * @param options - Loading options
 */
export async function loadBCTFromData(filename: string, options?: {
  setAsCurrent?: boolean;
  name?: string;
}): Promise<void> {
  const basePath = `/src/app/data/bct/${filename}`;
  return loadBCT(basePath, options);
}

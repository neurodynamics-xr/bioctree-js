/**
 * Spectral Data Loader for Bunny Spectral Package
 * 
 * Loads and validates spectral eigenmodes data from:
 * - data/bunny_spectral.json (manifest)
 * - data/bunny_spectral.bin (packed binary arrays)
 * 
 * Data includes:
 * - Mesh geometry: V (vertices), F (faces)
 * - Face topology: centroids, faceNormals, faceNeighbors, neighborEdge
 * - Spectral basis: lambda (eigenvalues), psiKV (eigenvectors), gradPsi_CKF (gradient basis)
 */

export interface SpectralManifest {
  schema: string;
  version: string;
  nV: number;  // Number of vertices
  nF: number;  // Number of faces
  K: number;   // Number of eigenmodes
  flags: {
    has_boundary: boolean;
  };
  layouts: {
    psiKV: string;      // "K_nV" (row-major: psi[k,v] = psiKV[k + K*v])
    gradPsi_CKF: string; // "C_K_nF" (row-major: grad[c,k,f] = gradPsi[c + 3*(k + K*f)])
  };
  buffers: Array<{
    name: string;
    dtype: string;  // "float32" | "uint32" | "int32" | "uint8"
    shape: number[];
    count: number;
    byteOffset: number;
  }>;
}

export interface SpectralData {
  meta: {
    schema: string;
    version: string;
    nV: number;
    nF: number;
    K: number;
    flags: {
      has_boundary: boolean;
    };
    layouts: {
      psiKV: string;
      gradPsi_CKF: string;
    };
  };
  arrays: {
    V: Float32Array;           // [nV, 3] vertex positions
    F: Uint32Array;            // [nF, 3] face indices
    centroids: Float32Array;   // [nF, 3] face centroids
    faceNormals: Float32Array; // [nF, 3] face normals
    faceNeighbors: Int32Array; // [nF, 3] neighbor face indices (-1 = boundary)
    neighborEdge: Uint8Array;  // [nF, 3] which edge in neighbor corresponds to shared edge
    lambda: Float32Array;      // [K] eigenvalues
    psiKV: Float32Array;       // [K, nV] eigenvectors (row-major: psi[k,v] = psiKV[k + K*v])
    gradPsi_CKF: Float32Array; // [3, K, nF] gradient basis (row-major: grad[c,k,f] = gradPsi[c + 3*(k + K*f)])
  };
  shapes: {
    V: number[];
    F: number[];
    centroids: number[];
    faceNormals: number[];
    faceNeighbors: number[];
    neighborEdge: number[];
    lambda: number[];
    psiKV: number[];
    gradPsi_CKF: number[];
  };
}

/**
 * Map dtype string to TypedArray constructor
 */
function getTypedArrayConstructor(dtype: string): any {
  const dtypeMap: Record<string, any> = {
    'float32': Float32Array,
    'uint32': Uint32Array,
    'int32': Int32Array,
    'uint8': Uint8Array,
  };
  
  const constructor = dtypeMap[dtype];
  if (!constructor) {
    throw new Error(`Unknown dtype: ${dtype}`);
  }
  return constructor;
}

/**
 * Get bytes per element for a dtype
 */
function getBytesPerElement(dtype: string): number {
  const bytesMap: Record<string, number> = {
    'float32': 4,
    'uint32': 4,
    'int32': 4,
    'uint8': 1,
  };
  
  const bytes = bytesMap[dtype];
  if (bytes === undefined) {
    throw new Error(`Unknown dtype: ${dtype}`);
  }
  return bytes;
}

/**
 * Load spectral data package from JSON manifest + BIN file
 * 
 * @param jsonPath - Path to JSON manifest (e.g., "data/bunny_spectral.json")
 * @param binPath - Path to BIN file (e.g., "data/bunny_spectral.bin")
 * @returns Promise resolving to SpectralData object
 */
export async function loadSpectralData(
  jsonPath: string = '/data/bunny_spectral.json',
  binPath: string = '/data/bunny_spectral.bin'
): Promise<SpectralData> {
  // Fetch JSON manifest
  const manifestResponse = await fetch(jsonPath);
  if (!manifestResponse.ok) {
    throw new Error(`Failed to fetch manifest: ${manifestResponse.statusText}`);
  }
  const manifest: SpectralManifest = await manifestResponse.json();
  // Fetch binary data
  const binResponse = await fetch(binPath);
  if (!binResponse.ok) {
    throw new Error(`Failed to fetch binary data: ${binResponse.statusText}`);
  }
  const arrayBuffer = await binResponse.arrayBuffer();
  // Create typed array views for each buffer
  const arrays: any = {};
  const shapes: any = {};
  
  for (const bufferDef of manifest.buffers) {
    const { name, dtype, shape, count, byteOffset } = bufferDef;
    
    // Validate buffer definition
    const expectedCount = shape.reduce((a, b) => a * b, 1);
    if (count !== expectedCount) {
    }
    
    // Get typed array constructor
    const TypedArrayConstructor = getTypedArrayConstructor(dtype);
    const bytesPerElement = getBytesPerElement(dtype);
    
    // Validate byte offset and length
    const expectedByteLength = count * bytesPerElement;
    const endOffset = byteOffset + expectedByteLength;
    
    if (endOffset > arrayBuffer.byteLength) {
      throw new Error(
        `Buffer '${name}' extends beyond ArrayBuffer: ` +
        `offset=${byteOffset}, length=${expectedByteLength}, total=${arrayBuffer.byteLength}`
      );
    }
    
    // Create typed array view (no copy)
    arrays[name] = new TypedArrayConstructor(arrayBuffer, byteOffset, count);
    shapes[name] = shape;
  }
  
  // Validate required buffers exist
  const requiredBuffers = [
    'V', 'F', 'centroids', 'faceNormals', 'faceNeighbors', 'neighborEdge',
    'lambda', 'psiKV', 'gradPsi_CKF'
  ];
  
  for (const bufferName of requiredBuffers) {
    if (!(bufferName in arrays)) {
      throw new Error(`Required buffer '${bufferName}' not found in manifest`);
    }
  }
  
  // Validate shapes match metadata
  const { nV, nF, K } = manifest;
  
  const expectedShapes: Record<string, number[]> = {
    V: [nV, 3],
    F: [nF, 3],
    centroids: [nF, 3],
    faceNormals: [nF, 3],
    faceNeighbors: [nF, 3],
    neighborEdge: [nF, 3],
    lambda: [K],
    psiKV: [K, nV],
    gradPsi_CKF: [3, K, nF],
  };
  
  for (const [bufferName, expectedShape] of Object.entries(expectedShapes)) {
    const actualShape = shapes[bufferName];
    if (JSON.stringify(actualShape) !== JSON.stringify(expectedShape)) {
    }
  }
  
  // Construct final data object
  const spectralData: SpectralData = {
    meta: {
      schema: manifest.schema,
      version: manifest.version,
      nV,
      nF,
      K,
      flags: manifest.flags,
      layouts: manifest.layouts,
    },
    arrays: {
      V: arrays.V,
      F: arrays.F,
      centroids: arrays.centroids,
      faceNormals: arrays.faceNormals,
      faceNeighbors: arrays.faceNeighbors,
      neighborEdge: arrays.neighborEdge,
      lambda: arrays.lambda,
      psiKV: arrays.psiKV,
      gradPsi_CKF: arrays.gradPsi_CKF,
    },
    shapes: {
      V: shapes.V,
      F: shapes.F,
      centroids: shapes.centroids,
      faceNormals: shapes.faceNormals,
      faceNeighbors: shapes.faceNeighbors,
      neighborEdge: shapes.neighborEdge,
      lambda: shapes.lambda,
      psiKV: shapes.psiKV,
      gradPsi_CKF: shapes.gradPsi_CKF,
    },
  };
  
  // Log validation summary
  return spectralData;
}

/**
 * Helper function to access eigenvector value
 * 
 * @param psiKV - Eigenvector array [K, nV] in row-major layout
 * @param K - Number of eigenmodes
 * @param k - Eigenmode index (0 to K-1)
 * @param v - Vertex index (0 to nV-1)
 * @returns Eigenvector value psi[k, v]
 */
export function getPsi(psiKV: Float32Array, K: number, k: number, v: number): number {
  return psiKV[k + K * v];
}

/**
 * Helper function to access gradient basis component
 * 
 * @param gradPsi_CKF - Gradient basis array [3, K, nF] in row-major layout
 * @param K - Number of eigenmodes
 * @param c - Component index (0=x, 1=y, 2=z)
 * @param k - Eigenmode index (0 to K-1)
 * @param f - Face index (0 to nF-1)
 * @returns Gradient component grad[c, k, f]
 */
export function getGradPsi(
  gradPsi_CKF: Float32Array,
  K: number,
  c: number,
  k: number,
  f: number
): number {
  return gradPsi_CKF[c + 3 * (k + K * f)];
}

/**
 * Field Data Loader
 * 
 * Loads scalar and vector fields for visualization on manifolds
 * Supports both JSON and binary formats
 */

import type { ScalarFieldData, VectorFieldData, LoadOptions, LoadResult } from './types';

/**
 * Field manifest structure (for binary fields)
 */
interface FieldManifest {
  name: string;
  type: 'scalar' | 'vector';
  vertexCount: number;
  dataFile: string;
  dtype?: 'float32' | 'float64';
  colormap?: string;
  metadata?: Record<string, any>;
}

/**
 * Load scalar field from JSON or binary
 * 
 * @param path - Path to field data (.json or .bin with manifest)
 * @param options - Loading options
 * @returns Promise resolving to ScalarFieldData
 */
export async function loadScalarField(
  path: string,
  options: LoadOptions = {}
): Promise<LoadResult<ScalarFieldData>> {
  const startTime = performance.now();
  try {
    let fieldData: ScalarFieldData;
    
    if (path.endsWith('.json')) {
      // Check if this is a manifest or raw data
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to fetch field: ${response.statusText}`);
      }
      const json = await response.json();
      
      if (json.type && json.dataFile) {
        // Manifest format
        fieldData = await loadBinaryScalarField(path, json as FieldManifest, options);
      } else {
        // Raw JSON format
        fieldData = parseJSONScalarField(path, json);
      }
    } else if (path.endsWith('.bin')) {
      // Need manifest for binary files
      const manifestPath = path.replace('.bin', '.json');
      const manifestResponse = await fetch(manifestPath);
      if (!manifestResponse.ok) {
        throw new Error(`Failed to fetch manifest: ${manifestResponse.statusText}`);
      }
      const manifest: FieldManifest = await manifestResponse.json();
      fieldData = await loadBinaryScalarField(path, manifest, options);
    } else {
      throw new Error(`Unsupported field format: ${path}`);
    }
    
    const duration = performance.now() - startTime;
    return {
      data: fieldData,
      duration,
      cached: false,
    };
    
  } catch (error) {
    if (options.onError) {
      options.onError(error as Error);
    }
    throw error;
  }
}

/**
 * Parse scalar field from JSON
 */
function parseJSONScalarField(path: string, json: any): ScalarFieldData {
  const name = json.name || path.split('/').pop()?.replace('.json', '') || 'unnamed';
  
  let values: Float32Array;
  if (json.values) {
    values = new Float32Array(json.values);
  } else if (json.data) {
    values = new Float32Array(json.data);
  } else {
    throw new Error('JSON field missing "values" or "data" array');
  }
  
  // Compute range
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    if (values[i] < min) min = values[i];
    if (values[i] > max) max = values[i];
  }
  
  return {
    name,
    values,
    vertexCount: values.length,
    range: [min, max],
    colormap: json.colormap,
    metadata: json.metadata,
  };
}

/**
 * Load binary scalar field
 */
async function loadBinaryScalarField(
  path: string,
  manifest: FieldManifest,
  options: LoadOptions
): Promise<ScalarFieldData> {
  const binPath = path.endsWith('.json') 
    ? path.replace('.json', '.bin')
    : path;
  
  const response = await fetch(binPath);
  if (!response.ok) {
    throw new Error(`Failed to fetch binary field: ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  
  // Parse based on dtype
  const dtype = manifest.dtype || 'float32';
  let values: Float32Array;
  
  if (dtype === 'float32') {
    values = new Float32Array(arrayBuffer);
  } else if (dtype === 'float64') {
    // Convert float64 to float32
    const f64 = new Float64Array(arrayBuffer);
    values = new Float32Array(f64);
  } else {
    throw new Error(`Unsupported dtype: ${dtype}`);
  }
  
  // Validate vertex count
  if (values.length !== manifest.vertexCount) {
    throw new Error(
      `Vertex count mismatch: expected ${manifest.vertexCount}, got ${values.length}`
    );
  }
  
  // Compute range
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    if (values[i] < min) min = values[i];
    if (values[i] > max) max = values[i];
  }
  
  return {
    name: manifest.name,
    values,
    vertexCount: manifest.vertexCount,
    range: [min, max],
    colormap: manifest.colormap,
    metadata: manifest.metadata,
  };
}

/**
 * Load vector field from JSON or binary
 * 
 * @param path - Path to field data
 * @param options - Loading options
 * @returns Promise resolving to VectorFieldData
 */
export async function loadVectorField(
  path: string,
  options: LoadOptions = {}
): Promise<LoadResult<VectorFieldData>> {
  const startTime = performance.now();
  try {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to fetch field: ${response.statusText}`);
    }
    
    let fieldData: VectorFieldData;
    
    if (path.endsWith('.json')) {
      const json = await response.json();
      fieldData = parseJSONVectorField(path, json);
    } else {
      throw new Error('Binary vector fields not yet implemented');
    }
    
    const duration = performance.now() - startTime;
    return {
      data: fieldData,
      duration,
      cached: false,
    };
    
  } catch (error) {
    if (options.onError) {
      options.onError(error as Error);
    }
    throw error;
  }
}

/**
 * Parse vector field from JSON
 */
function parseJSONVectorField(path: string, json: any): VectorFieldData {
  const name = json.name || path.split('/').pop()?.replace('.json', '') || 'unnamed';
  
  let vectors: Float32Array;
  if (json.vectors) {
    vectors = new Float32Array(json.vectors);
  } else if (json.data) {
    vectors = new Float32Array(json.data);
  } else {
    throw new Error('JSON field missing "vectors" or "data" array');
  }
  
  // Validate vector count
  if (vectors.length % 3 !== 0) {
    throw new Error('Vector data length must be multiple of 3');
  }
  
  const vertexCount = vectors.length / 3;
  
  // Compute magnitudes if not provided
  let magnitude: Float32Array | undefined;
  if (json.magnitude) {
    magnitude = new Float32Array(json.magnitude);
  } else {
    magnitude = new Float32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      const vx = vectors[i * 3 + 0];
      const vy = vectors[i * 3 + 1];
      const vz = vectors[i * 3 + 2];
      magnitude[i] = Math.sqrt(vx * vx + vy * vy + vz * vz);
    }
  }
  
  return {
    name,
    vectors,
    vertexCount,
    magnitude,
    metadata: json.metadata,
  };
}

/**
 * Validate field data matches manifold vertex count
 */
export function validateFieldManifoldMatch(
  field: ScalarFieldData | VectorFieldData,
  manifoldVertexCount: number
): { valid: boolean; error?: string } {
  if (field.vertexCount !== manifoldVertexCount) {
    return {
      valid: false,
      error: `Field vertex count (${field.vertexCount}) does not match manifold (${manifoldVertexCount})`,
    };
  }
  return { valid: true };
}

/**
 * Manifold Geometry Loader
 * 
 * Loads 3D manifold geometry from various formats:
 * - GLB/GLTF (binary/text glTF)
 * - OBJ (Wavefront)
 * - JSON (custom format with vertices/faces)
 * 
 * Pure data loading - no Three.js scene graph manipulation
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import type { ManifoldData, ManifoldFormat, LoadOptions, LoadResult, RawManifoldData } from './types';

/**
 * Load manifold geometry from URL
 * Auto-detects format from file extension
 * 
 * @param url - Path to manifold file
 * @param format - Optional format override
 * @param options - Loading options
 * @returns Promise resolving to ManifoldData
 */
export async function loadManifold(
  url: string,
  format?: ManifoldFormat,
  options: LoadOptions = {}
): Promise<LoadResult<ManifoldData>> {
  const startTime = performance.now();
  
  // Detect format from URL if not provided
  const detectedFormat = (format || detectFormat(url)) as ManifoldFormat;
  try {
    let manifestData: ManifoldData;
    
    switch (detectedFormat) {
      case 'glb':
      case 'gltf':
        manifestData = await loadGLTF(url, detectedFormat, options);
        break;
      case 'obj':
        manifestData = await loadOBJ(url, options);
        break;
      case 'json':
        manifestData = await loadJSON(url, options);
        break;
      default:
        throw new Error(`Unsupported format: ${detectedFormat}`);
    }
    
    const duration = performance.now() - startTime;
    return {
      data: manifestData,
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
 * Detect format from file extension
 */
function detectFormat(url: string): string {
  const ext = url.split('.').pop()?.toLowerCase() || '';
  if (['glb', 'gltf', 'obj', 'json'].includes(ext)) {
    return ext;
  }
  throw new Error(`Cannot detect format from URL: ${url}`);
}

/**
 * Load GLTF/GLB file
 */
async function loadGLTF(
  url: string,
  format: 'glb' | 'gltf',
  options: LoadOptions
): Promise<ManifoldData> {
  const loader = new GLTFLoader();
  
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const scene = gltf.scene;
        const statistics = computeStatistics(scene);
        
        resolve({
          format,
          source: url,
          scene,
          statistics,
          metadata: {
            animations: gltf.animations.length,
            cameras: gltf.cameras.length,
          },
        });
      },
      (progress) => {
        if (options.onProgress && progress.total > 0) {
          options.onProgress({
            loaded: progress.loaded,
            total: progress.total,
            percentage: (progress.loaded / progress.total) * 100,
          });
        }
      },
      (error) => {
        reject(new Error(`Failed to load GLTF: ${error}`));
      }
    );
  });
}

/**
 * Load OBJ file
 */
async function loadOBJ(
  url: string,
  options: LoadOptions
): Promise<ManifoldData> {
  const loader = new OBJLoader();
  
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (group) => {
        const statistics = computeStatistics(group);
        
        resolve({
          format: 'obj',
          source: url,
          scene: group,
          statistics,
        });
      },
      (progress) => {
        if (options.onProgress && progress.total > 0) {
          options.onProgress({
            loaded: progress.loaded,
            total: progress.total,
            percentage: (progress.loaded / progress.total) * 100,
          });
        }
      },
      (error) => {
        reject(new Error(`Failed to load OBJ: ${error}`));
      }
    );
  });
}

/**
 * Load JSON geometry file
 * Format: { vertices: [...], faces: [...], normals?: [...], indexBase?: 0|1 }
 */
async function loadJSON(
  url: string,
  options: LoadOptions
): Promise<ManifoldData> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch JSON: ${response.statusText}`);
  }
  
  const raw: RawManifoldData = await response.json();
  
  // Convert raw data to BufferGeometry
  const geometry = new THREE.BufferGeometry();
  
  // Vertices
  const vertices = new Float32Array(raw.vertices);
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  
  // Faces (handle index base)
  let faces: Uint32Array;
  if (raw.indexBase === 1) {
    // Convert 1-based to 0-based
    faces = new Uint32Array(raw.faces.length);
    for (let i = 0; i < raw.faces.length; i++) {
      faces[i] = raw.faces[i] - 1;
    }
  } else {
    faces = new Uint32Array(raw.faces);
  }
  geometry.setIndex(new THREE.BufferAttribute(faces, 1));
  
  // Normals (if provided)
  if (raw.normals) {
    const normals = new Float32Array(raw.normals);
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  } else {
    geometry.computeVertexNormals();
  }
  
  // UVs (if provided)
  if (raw.uvs) {
    const uvs = new Float32Array(raw.uvs);
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }
  
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  
  const statistics = {
    vertexCount: vertices.length / 3,
    faceCount: faces.length / 3,
    bounds: geometry.boundingBox ? {
      min: geometry.boundingBox.min.clone(),
      max: geometry.boundingBox.max.clone(),
    } : undefined,
  };
  
  return {
    format: 'json',
    source: url,
    geometry,
    statistics,
    metadata: {
      indexBase: raw.indexBase || 0,
      coordinateFrame: raw.coordinateFrame || 'matlab',
    },
  };
}

/**
 * Compute mesh statistics from scene graph
 */
function computeStatistics(object: THREE.Object3D): ManifoldData['statistics'] {
  let vertexCount = 0;
  let faceCount = 0;
  const bounds = new THREE.Box3();
  
  object.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const geom = child.geometry;
      
      // Count vertices
      const pos = geom.attributes.position;
      if (pos) {
        vertexCount += pos.count;
      }
      
      // Count faces
      const index = geom.index;
      if (index) {
        faceCount += index.count / 3;
      } else if (pos) {
        faceCount += pos.count / 3;
      }
      
      // Expand bounds
      geom.computeBoundingBox();
      if (geom.boundingBox) {
        bounds.union(geom.boundingBox);
      }
    }
  });
  
  return {
    vertexCount,
    faceCount,
    bounds: bounds.isEmpty() ? undefined : {
      min: bounds.min.clone(),
      max: bounds.max.clone(),
    },
  };
}

/**
 * Extract raw geometry data from loaded manifold
 * Useful for validation or conversion
 */
export function extractRawData(manifold: ManifoldData): RawManifoldData | null {
  if (manifold.geometry) {
    const geom = manifold.geometry;
    const pos = geom.attributes.position;
    const index = geom.index;
    const normal = geom.attributes.normal;
    
    if (!pos || !index) {
      return null;
    }
    
    return {
      vertices: new Float32Array(pos.array),
      faces: new Uint32Array(index.array),
      normals: normal ? new Float32Array(normal.array) : undefined,
      indexBase: 0,
      coordinateFrame: (manifold.metadata?.coordinateFrame as any) || 'threejs',
    };
  }
  
  // For scene graph, extract first mesh
  if (manifold.scene) {
    let firstGeometry: THREE.BufferGeometry | null = null;
    manifold.scene.traverse((child) => {
      if (!firstGeometry && child instanceof THREE.Mesh && child.geometry) {
        firstGeometry = child.geometry;
      }
    });
    
    if (firstGeometry) {
      return extractRawData({ ...manifold, geometry: firstGeometry, scene: undefined });
    }
  }
  
  return null;
}

/**
 * GPU resource types for WebGPU resource management
 */

import type * as THREE from 'three/webgpu';

/**
 * GPU buffer usage flags (WebGPU-compatible)
 */
export enum GPUBufferUsage {
  VERTEX = 'vertex',
  INDEX = 'index',
  STORAGE = 'storage',
  UNIFORM = 'uniform',
  COPY_SRC = 'copy_src',
  COPY_DST = 'copy_dst',
}

/**
 * Data type descriptor
 */
export type GPUDataType = 'float32' | 'uint32' | 'uint16' | 'int32';

/**
 * Buffer layout descriptor
 */
export interface GPUBufferLayout {
  stride: number;        // Bytes per element (e.g., 12 for vec3<f32>)
  elementCount: number;  // Number of elements
  itemSize: number;      // Components per element (e.g., 3 for vec3)
  dtype: GPUDataType;
}

/**
 * GPU buffer handle
 */
export interface GPUBufferHandle {
  key: string;
  bufferAttribute: THREE.StorageBufferAttribute | THREE.BufferAttribute;
  byteLength: number;
  layout: GPUBufferLayout;
  usage: GPUBufferUsage[];
  refCount: number;
  cpuData?: Float32Array | Uint32Array | Uint16Array | Int32Array; // Optional CPU copy
}

/**
 * GPU texture handle (for future use)
 */
export interface GPUTextureHandle {
  key: string;
  texture: THREE.Texture;
  width: number;
  height: number;
  format: string;
  refCount: number;
}

/**
 * Manifold geometry descriptor (GPU-resident)
 */
export interface ManifoldGeometryDescriptor {
  manifoldId: string;
  positionHandle: GPUBufferHandle;
  indexHandle: GPUBufferHandle;
  geometry: THREE.BufferGeometry;
  nV: number;
  nF: number;
}

/**
 * Resource allocation options
 */
export interface BufferAllocationOptions {
  usage: GPUBufferUsage[];
  retainCpu?: boolean;    // Keep CPU copy after upload (default: true for dev)
  dynamic?: boolean;      // Buffer will be updated frequently
}

/**
 * Resource statistics
 */
export interface GPUResourceStats {
  totalBuffers: number;
  totalTextures: number;
  totalBytes: number;
  buffersByKey: Map<string, number>; // key -> byte size
}

/**
 * Storage buffer descriptor (for compute pipelines)
 */
export interface StorageBufferDescriptor {
  key: string;
  bufferAttribute: THREE.StorageBufferAttribute;
  layout: GPUBufferLayout;
  usage: GPUBufferUsage[];
  refCount: number;
  cpuData?: Float32Array | Uint32Array | Uint16Array | Int32Array;
  metadata?: Record<string, any>;
}


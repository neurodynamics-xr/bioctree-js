/**
 * GPUResourceManager
 * 
 * Single authority for GPU buffer/texture allocations.
 * Manages resource lifetime, deduplication, and metadata.
 * 
 * Key responsibilities:
 * - One-time upload of mesh geometry
 * - Deduplicate shared resources by stable keys
 * - Track ref counts and cleanup
 * - Provide typed handles for rendering/compute
 * - Manage storage buffer lifecycle for compute pipelines
 */

import * as THREE from 'three/webgpu';
import type { Manifold } from '../manifold/Manifold';
import type { Field } from '../field/Field';
import * as keys from './keys';
import {
  GPUBufferUsage,
  type GPUBufferHandle,
  type GPUBufferLayout,
  type GPUDataType,
  type GPUTextureHandle,
  type ManifoldGeometryDescriptor,
  type BufferAllocationOptions,
  type GPUResourceStats,
  type StorageBufferDescriptor
} from './types';

/**
 * GPU Resource Manager
 * Singleton pattern - instantiate once per viewer
 */
export class GPUResourceManager {
  private buffers = new Map<string, GPUBufferHandle>();
  private storageBuffers = new Map<string, StorageBufferDescriptor>();
  private textures = new Map<string, GPUTextureHandle>();
  private geometryCache = new Map<string, { geometry: THREE.BufferGeometry; manifoldId: string; lastUsed: number }>();
  private retainCpuDefault: boolean;
  private maxGeometryCacheSize = 10; // Max cached geometries
  private lruQueue: string[] = []; // LRU eviction queue

  constructor(options?: { retainCpu?: boolean; maxCacheSize?: number }) {
    this.retainCpuDefault = options?.retainCpu ?? true; // Retain CPU for dev/debug by default
    this.maxGeometryCacheSize = options?.maxCacheSize ?? 10;
  }

  /**
   * Get or create manifold geometry buffers (positions + indices)
   * This is the primary entry point for mesh upload
   */
  getOrCreateManifoldGeometry(manifold: Manifold): ManifoldGeometryDescriptor {
    const manifoldId = manifold.metadata.id;
    const geomKey = keys.manifoldGeometryKey(manifoldId);

    // Check geometry cache (with LRU update)
    const cached = this.geometryCache.get(geomKey);
    if (cached) {
      cached.lastUsed = Date.now();
      this.updateLRU(geomKey);

      return {
        manifoldId,
        positionHandle: this.buffers.get(keys.manifoldPositionsKey(manifoldId))!,
        indexHandle: this.buffers.get(keys.manifoldIndicesKey(manifoldId))!,
        geometry: cached.geometry,
        nV: manifold.nV,
        nF: manifold.nF
      };
    }
    // Extract data once from manifold
    const vertices = manifold.core.vertices;
    const faces = manifold.core.faces;

    // Create position buffer
    const posKey = keys.manifoldPositionsKey(manifoldId);
    const posLayout: GPUBufferLayout = {
      stride: 12, // 3 * 4 bytes (vec3<f32>)
      elementCount: manifold.nV,
      itemSize: 3,
      dtype: 'float32'
    };

    const posHandle = this.createStorageBuffer(
      posKey,
      vertices,
      [GPUBufferUsage.STORAGE, GPUBufferUsage.VERTEX],
      posLayout,
      { usage: [GPUBufferUsage.STORAGE, GPUBufferUsage.VERTEX], retainCpu: this.retainCpuDefault }
    );

    // Create index buffer
    const idxKey = keys.manifoldIndicesKey(manifoldId);
    const idxLayout: GPUBufferLayout = {
      stride: 4, // 1 * 4 bytes (u32)
      elementCount: manifold.nF * 3,
      itemSize: 1,
      dtype: 'uint32'
    };

    const idxHandle = this.createStorageBuffer(
      idxKey,
      faces,
      [GPUBufferUsage.STORAGE, GPUBufferUsage.INDEX],
      idxLayout,
      { usage: [GPUBufferUsage.STORAGE, GPUBufferUsage.INDEX], retainCpu: this.retainCpuDefault }
    );

    // Create Three.js geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', posHandle.bufferAttribute);
    geometry.setIndex(idxHandle.bufferAttribute);
    
    // Compute normals (creates 'normal' attribute)
    geometry.computeVertexNormals();
    
    // Verify attributes are properly set
    const posAttr = geometry.getAttribute('position');
    const normalAttr = geometry.getAttribute('normal');
    const indexAttr = geometry.getIndex();
    
    if (!posAttr || !normalAttr || !indexAttr) {
      throw new Error('Failed to create geometry attributes');
    }
    // Note: Coordinate transforms disabled for now - will implement later
    // Transform matrix stored in manifold.metadata.transform if needed

    // Add to geometry cache with LRU
    this.addToGeometryCache(geomKey, geometry, manifoldId);
    return {
      manifoldId,
      positionHandle: posHandle,
      indexHandle: idxHandle,
      geometry,
      nV: manifold.nV,
      nF: manifold.nF
    };
  }

  /**
   * Add geometry to cache with LRU eviction
   */
  private addToGeometryCache(key: string, geometry: THREE.BufferGeometry, manifoldId: string): void {
    // Evict oldest if at capacity
    if (this.geometryCache.size >= this.maxGeometryCacheSize) {
      this.evictOldestGeometry();
    }

    this.geometryCache.set(key, {
      geometry,
      manifoldId,
      lastUsed: Date.now()
    });
    this.lruQueue.push(key);
  }

  /**
   * Update LRU queue when geometry is accessed
   */
  private updateLRU(key: string): void {
    const index = this.lruQueue.indexOf(key);
    if (index !== -1) {
      this.lruQueue.splice(index, 1);
    }
    this.lruQueue.push(key);
  }

  /**
   * Evict least recently used geometry
   */
  private evictOldestGeometry(): void {
    if (this.lruQueue.length === 0) return;

    const oldestKey = this.lruQueue.shift()!;
    const entry = this.geometryCache.get(oldestKey);
    
    if (entry) {
      entry.geometry.dispose();
      this.geometryCache.delete(oldestKey);
      
      // Also remove associated buffers
      const posKey = keys.manifoldPositionsKey(entry.manifoldId);
      const idxKey = keys.manifoldIndicesKey(entry.manifoldId);
      this.buffers.delete(posKey);
      this.buffers.delete(idxKey);
    }
  }

  /**
   * Create or get storage buffer handle
   */
  getOrCreateStorageBuffer(
    key: string,
    typedArray: Float32Array | Uint32Array | Uint16Array | Int32Array,
    usage: GPUBufferUsage[],
    layout: GPUBufferLayout
  ): GPUBufferHandle {
    const existing = this.buffers.get(key);
    if (existing) {
      existing.refCount++;
      return existing;
    }

    return this.createStorageBuffer(key, typedArray, usage, layout, {
      usage,
      retainCpu: this.retainCpuDefault
    });
  }

  /**
   * Create empty storage buffer (for compute outputs)
   */
  createEmptyStorageBuffer(
    key: string,
    byteLength: number,
    dtype: GPUDataType,
    itemSize: number,
    usage: GPUBufferUsage[]
  ): GPUBufferHandle {
    const existing = this.buffers.get(key);
    if (existing) {
      existing.refCount++;
      return existing;
    }
    // Create empty typed array of correct type
    let typedArray: Float32Array | Uint32Array | Uint16Array | Int32Array;
    const elementCount = byteLength / this.getBytesPerElement(dtype);

    switch (dtype) {
      case 'float32':
        typedArray = new Float32Array(elementCount);
        break;
      case 'uint32':
        typedArray = new Uint32Array(elementCount);
        break;
      case 'uint16':
        typedArray = new Uint16Array(elementCount);
        break;
      case 'int32':
        typedArray = new Int32Array(elementCount);
        break;
    }

    const layout: GPUBufferLayout = {
      stride: this.getBytesPerElement(dtype) * itemSize,
      elementCount: elementCount / itemSize,
      itemSize,
      dtype
    };

    return this.createStorageBuffer(key, typedArray, usage, layout, {
      usage,
      retainCpu: false // Empty buffers don't need CPU copy
    });
  }

  /**
   * Get buffer by key (does not increment ref count)
   */
  getBuffer(key: string): GPUBufferHandle | undefined {
    return this.buffers.get(key);
  }

  /**
   * Create field scalar buffer
   * @deprecated Use getOrCreateStorageBuffer with explicit data
   */
  getOrCreateFieldBuffer(field: Field): GPUBufferHandle {
    const key = keys.fieldScalarKey(field.metadata.id);
    
    const existing = this.buffers.get(key);
    if (existing) {
      existing.refCount++;
      return existing;
    }
    // For now, throw error - caller should migrate to new pattern
    throw new Error('getOrCreateFieldBuffer is deprecated. Use getOrCreateStorageBuffer with explicit data and createBufferField()');
  }

  /**
   * Release a resource by key (decrement ref count)
   */
  release(key: string): void {
    const handle = this.buffers.get(key);
    if (!handle) {
      return;
    }

    handle.refCount--;
    if (handle.refCount <= 0) {
      this.dispose(key);
    }
  }

  /**
   * Dispose a single resource
   */
  dispose(key: string): void {
    const handle = this.buffers.get(key);
    if (!handle) return;
    // Dispose Three.js buffer attribute
    if (handle.bufferAttribute) {
      // Three.js disposal is handled by geometry.dispose()
      // No explicit buffer disposal needed for StorageBufferAttribute
    }

    // Clear CPU copy if retained
    if (handle.cpuData) {
      (handle as any).cpuData = null;
    }

    this.buffers.delete(key);
  }

  /**
   * Dispose all resources
   */
  disposeAll(): void {
    for (const key of this.buffers.keys()) {
      this.dispose(key);
    }

    this.buffers.clear();
  }

  /**
   * Get resource statistics
   */
  getStats(): GPUResourceStats {
    let totalBytes = 0;
    const buffersByKey = new Map<string, number>();

    for (const [key, handle] of this.buffers.entries()) {
      totalBytes += handle.byteLength;
      buffersByKey.set(key, handle.byteLength);
    }

    return {
      totalBuffers: this.buffers.size,
      totalTextures: 0, // TODO: implement texture tracking
      totalBytes,
      buffersByKey
    };
  }

  /**
   * Internal: Create storage buffer handle
   */
  private createStorageBuffer(
    key: string,
    typedArray: Float32Array | Uint32Array | Uint16Array | Int32Array,
    usage: GPUBufferUsage[],
    layout: GPUBufferLayout,
    options: BufferAllocationOptions
  ): GPUBufferHandle {
    // Create Three.js StorageBufferAttribute
    const bufferAttribute = new THREE.StorageBufferAttribute(typedArray, layout.itemSize);

    const handle: GPUBufferHandle = {
      key,
      bufferAttribute,
      byteLength: typedArray.byteLength,
      layout,
      usage,
      refCount: 1,
      cpuData: options.retainCpu ? typedArray : undefined
    };

    this.buffers.set(key, handle);
    return handle;
  }

  /**
   * Get bytes per element for data type
   */
  private getBytesPerElement(dtype: GPUDataType): number {
    switch (dtype) {
      case 'float32': return 4;
      case 'uint32': return 4;
      case 'int32': return 4;
      case 'uint16': return 2;
    }
  }

  // ============================================================================
  // Storage Buffer Lifecycle Management (for Compute Pipelines)
  // ============================================================================

  /**
   * Register a named storage buffer for compute pipelines
   * Allows multiple consumers to reference the same buffer by key
   */
  registerStorageBuffer(
    key: string,
    typedArray: Float32Array | Uint32Array | Uint16Array | Int32Array,
    itemSize: number,
    options?: {
      retainCpu?: boolean;
      usage?: GPUBufferUsage[];
      metadata?: Record<string, any>;
    }
  ): StorageBufferDescriptor {
    if (this.storageBuffers.has(key)) {
      const existing = this.storageBuffers.get(key)!;
      existing.refCount++;
      return existing;
    }
    // Determine dtype from TypedArray type
    let dtype: GPUDataType;
    if (typedArray instanceof Float32Array) dtype = 'float32';
    else if (typedArray instanceof Uint32Array) dtype = 'uint32';
    else if (typedArray instanceof Uint16Array) dtype = 'uint16';
    else if (typedArray instanceof Int32Array) dtype = 'int32';
    else throw new Error('Unsupported TypedArray type');

    // Create StorageBufferAttribute
    const bufferAttribute = new THREE.StorageBufferAttribute(typedArray, itemSize);

    // Create descriptor
    const descriptor: StorageBufferDescriptor = {
      key,
      bufferAttribute,
      layout: {
        stride: this.getBytesPerElement(dtype) * itemSize,
        elementCount: typedArray.length / itemSize,
        itemSize,
        dtype
      },
      usage: options?.usage || [GPUBufferUsage.STORAGE],
      refCount: 1,
      cpuData: options?.retainCpu ? typedArray : undefined,
      metadata: options?.metadata || {}
    };

    this.storageBuffers.set(key, descriptor);
    return descriptor;
  }

  /**
   * Get storage buffer descriptor by key
   */
  getStorageBuffer(key: string): StorageBufferDescriptor | undefined {
    return this.storageBuffers.get(key);
  }

  /**
   * Check if storage buffer exists
   */
  hasStorageBuffer(key: string): boolean {
    return this.storageBuffers.has(key);
  }

  /**
   * Release storage buffer reference (decrement ref count)
   */
  releaseStorageBuffer(key: string): void {
    const descriptor = this.storageBuffers.get(key);
    if (!descriptor) {
      return;
    }

    descriptor.refCount--;
    if (descriptor.refCount <= 0) {
      this.disposeStorageBuffer(key);
    }
  }

  /**
   * Dispose storage buffer (cleanup)
   */
  private disposeStorageBuffer(key: string): void {
    const descriptor = this.storageBuffers.get(key);
    if (!descriptor) return;
    // Clear CPU copy if retained
    if (descriptor.cpuData) {
      (descriptor as any).cpuData = null;
    }

    // StorageBufferAttribute disposal is managed by Three.js
    this.storageBuffers.delete(key);
  }

  /**
   * Get all storage buffer keys (for debugging/inspection)
   */
  getStorageBufferKeys(): string[] {
    return Array.from(this.storageBuffers.keys());
  }

  /**
   * Bulk register storage buffers (for initialization)
   * Returns a map of key → descriptor
   */
  registerStorageBuffers(
    buffers: Map<string, {
      data: Float32Array | Uint32Array | Uint16Array | Int32Array;
      itemSize: number;
      options?: {
        retainCpu?: boolean;
        usage?: GPUBufferUsage[];
        metadata?: Record<string, any>;
      };
    }>
  ): Map<string, StorageBufferDescriptor> {
    const descriptors = new Map<string, StorageBufferDescriptor>();

    for (const [key, { data, itemSize, options }] of buffers.entries()) {
      const descriptor = this.registerStorageBuffer(key, data, itemSize, options);
      descriptors.set(key, descriptor);
    }
    return descriptors;
  }

  // ============================================================================
  // TEXTURE MANAGEMENT
  // ============================================================================

  /**
   * Get or create a texture by key and URL.
   * Handles reference counting and automatic disposal.
   * 
   * @param key - Unique identifier for the texture
   * @param url - URL to load the texture from (e.g., '/colormap_atlas.png')
   * @param options - Texture configuration options
   * @returns THREE.Texture instance
   * 
   * @example
   * // Load colormap atlas for LUT
   * const atlasTex = gpu.getOrCreateTexture(
   *   'colormaps_atlas',
   *   '/colormap_atlas.png',
   *   { colorSpace: 'srgb', filtering: 'linear' }
   * );
   */
  getOrCreateTexture(
    key: string,
    url: string,
    options?: {
      colorSpace?: 'srgb' | 'linear';
      filtering?: 'linear' | 'nearest';
      wrapping?: 'clamp' | 'repeat' | 'mirror';
      generateMipmaps?: boolean;
    }
  ): THREE.Texture {
    // Check for existing texture
    const existing = this.textures.get(key);
    if (existing) {
      existing.refCount++;
      return existing.texture;
    }
    // Load texture using Three.js TextureLoader
    const loader = new THREE.TextureLoader();
    const texture = loader.load(
      url,
      // onLoad callback
      (tex) => {
      },
      // onProgress callback
      undefined,
      // onError callback
      (error) => {
      }
    );

    // Apply configuration
    const {
      colorSpace = 'srgb',
      filtering = 'linear',
      wrapping = 'clamp',
      generateMipmaps = false
    } = options || {};

    // Set color space
    texture.colorSpace = colorSpace === 'srgb' ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;

    // Set wrapping mode
    const wrapMode = 
      wrapping === 'repeat' ? THREE.RepeatWrapping :
      wrapping === 'mirror' ? THREE.MirroredRepeatWrapping :
      THREE.ClampToEdgeWrapping;
    texture.wrapS = wrapMode;
    texture.wrapT = wrapMode;

    // Set filtering mode
    const filterMode = filtering === 'nearest' ? THREE.NearestFilter : THREE.LinearFilter;
    texture.minFilter = filterMode;
    texture.magFilter = filterMode;

    // Mipmap settings
    texture.generateMipmaps = generateMipmaps;

    // Mark as needing update
    texture.needsUpdate = true;

    // Create handle
    const handle: GPUTextureHandle = {
      key,
      texture,
      width: 0, // Will be set on load
      height: 0, // Will be set on load
      format: 'rgba',
      refCount: 1
    };

    this.textures.set(key, handle);
    return texture;
  }

  /**
   * Release texture reference (decrement ref count)
   * Automatically disposes when refCount reaches 0
   */
  releaseTexture(key: string): void {
    const handle = this.textures.get(key);
    if (!handle) {
      return;
    }

    handle.refCount--;
    if (handle.refCount <= 0) {
      handle.texture.dispose();
      this.textures.delete(key);
    }
  }

  /**
   * Get texture by key (without incrementing ref count)
   */
  getTexture(key: string): THREE.Texture | undefined {
    return this.textures.get(key)?.texture;
  }

  /**
   * Check if texture exists
   */
  hasTexture(key: string): boolean {
    return this.textures.has(key);
  }

  /**
   * Get all texture keys (for debugging/inspection)
   */
  getTextureKeys(): string[] {
    return Array.from(this.textures.keys());
  }

  // ============================================================================
  // END TEXTURE MANAGEMENT
  // ============================================================================

}

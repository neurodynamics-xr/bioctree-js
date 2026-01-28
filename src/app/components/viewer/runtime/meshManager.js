/**
 * @file meshManager.js
 * MeshManager - Owns mesh/model lifecycle: load, attach, clear, dispose
 * Extracted from render.js as part of runtime refactor
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { validateGeometryAttributes } from '../geometry/meshBuilder.js';
import { loadJSONGeometry } from '../loaders/jsonGeometryLoader.js';
import { disposeObject3D } from '../utils/dispose.js';

const BASE_COLOR_HEX = 0x999999; // [0.6 0.6 0.6]

/**
 * MeshManager - Manages mesh/model loading and lifecycle
 * Emits events: 'meshLoadStarted', 'meshLoaded', 'meshCleared', 'meshFailed'
 */
export class MeshManager {
  /**
   * @param {Object} viewerCore - ViewerCore instance
   */
  constructor(viewerCore) {
    this.viewerCore = viewerCore;
    this.modelRoot = null;
    this.loadedScene = null;
    this.listeners = new Map(); // event -> Set of callbacks
  }

  /**
   * Subscribe to mesh lifecycle events
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    
    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(event);
      if (listeners) {
        listeners.delete(callback);
      }
    };
  }

  /**
   * Emit event to all listeners
   * @private
   */
  _emit(event, data) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }

  /**
   * Load model from URL - detects file type and uses appropriate loader
   * @param {string} url - Path to model file (.glb, .gltf, or .json)
   * @returns {Promise<THREE.Group>} - The loaded scene
   */
  async loadModelFromUrl(url) {
    const ext = url.split('.').pop().toLowerCase();
    
    if (ext === 'glb' || ext === 'gltf') {
      return this.loadGLB(url);
    } else if (ext === 'json') {
      return this.loadJSON(url);
    } else if (ext === 'obj') {
      return this.loadOBJ(url);
    } else {
      throw new Error(`Unsupported file format: ${ext}`);
    }
  }

  /**
   * Load GLB/GLTF file
   * @param {string} url - Path to GLB file
   * @returns {Promise<THREE.Group>} - The loaded scene
   */
  async loadGLB(url) {
    // Emit load started event
    this._emit('meshLoadStarted', { url });
    
    try {
      // Clear any existing model (silent - no event)
      this.clearModel(true);

      const manager = new THREE.LoadingManager();
      manager.onError = (u) => console.error("Loading error:", u);

    const loader = new GLTFLoader(manager);
    const gltf = await new Promise((resolve, reject) => {
      loader.load(url, resolve, null, reject);
    });

    this.modelRoot = new THREE.Group();
    this.loadedScene = gltf.scene;

    // Apply defaults to all meshes
    this.loadedScene.traverse((obj) => {
      if (!obj.isMesh) return;

      const geom = obj.geometry;
      if (geom) {
        // Validate geometry attributes (does not compute)
        validateGeometryAttributes(geom);
      }

      // Create and cache both base and wireframe materials
      const baseMat = new THREE.MeshStandardMaterial({
        color: BASE_COLOR_HEX,
        roughness: 0.85,
        metalness: 0.0,
        side: THREE.DoubleSide,
      });

      const wireMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        side: THREE.DoubleSide,
      });

      obj.userData.baseMaterial = baseMat;
      obj.userData.wireMaterial = wireMat;

      // Start in base mode
      obj.material = baseMat;
    });

    this.modelRoot.add(this.loadedScene);

    // IMPORTANT: Add GLB to threejs frame root (identity transform)
    // GLB files are already Y-up from MATLAB export, no transform needed
    this.viewerCore.roots.threejs.add(this.modelRoot);

      // Emit mesh loaded event with statistics
      const stats = this.getMeshStatistics();
      this._emit('meshLoaded', { url, ...stats });

      return this.loadedScene;
    } catch (error) {
      this._emit('meshFailed', { url, error: error.message });
      throw error;
    }
  }

  /**
   * Load JSON geometry file
   * @param {string} url - Path to JSON geometry file
   * @returns {Promise<THREE.Group>} - The loaded scene
   */
  async loadJSON(url) {
    // Clear any existing model (silent - no event)
    this.clearModel(true);

    const geometry = await loadJSONGeometry(url);

    // Validate geometry attributes (does not compute)
    validateGeometryAttributes(geometry);

    // Create materials (match GLB loading exactly)
    const baseMat = new THREE.MeshStandardMaterial({
      color: BASE_COLOR_HEX,
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      side: THREE.DoubleSide,
    });

    // Create mesh with base material
    const mesh = new THREE.Mesh(geometry, baseMat);
    
    // Store materials in userData
    mesh.userData.baseMaterial = baseMat;
    mesh.userData.wireMaterial = wireMat;

    // Setup model root and loaded scene (match GLB structure)
    this.modelRoot = new THREE.Group();
    this.loadedScene = new THREE.Group();
    this.loadedScene.add(mesh);
    this.modelRoot.add(this.loadedScene);

    // IMPORTANT: Add JSON to MATLAB frame root (applies Z-up → Y-up transform)
    // Raw JSON data is in MATLAB Z-up coordinates and needs conversion
    this.viewerCore.roots.matlab.add(this.modelRoot);

    return this.loadedScene;
  }

  /**
   * Load OBJ file
   * @param {string} url - Path to OBJ file
   * @returns {Promise<THREE.Group>} - The loaded scene
   */
  async loadOBJ(url) {
    // Emit load started event
    this._emit('meshLoadStarted', { url });
    
    try {
      // Clear any existing model (silent - no event)
      this.clearModel(true);

      const manager = new THREE.LoadingManager();
      manager.onError = (u) => console.error("Loading error:", u);

      const loader = new OBJLoader(manager);
      const obj = await new Promise((resolve, reject) => {
        loader.load(url, resolve, null, reject);
      });

      console.log('[MeshManager] OBJ loaded:', obj);

      // Apply defaults to all meshes (match GLB loading pattern)
      obj.traverse((child) => {
        if (!child.isMesh) return;

        const geom = child.geometry;
        if (geom) {
          // Validate geometry attributes (computes normals if missing)
          validateGeometryAttributes(geom);
        }

        // Create and cache both base and wireframe materials
        const baseMat = new THREE.MeshStandardMaterial({
          color: BASE_COLOR_HEX,
          roughness: 0.85,
          metalness: 0.0,
          side: THREE.DoubleSide,
        });

        const wireMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          wireframe: true,
          side: THREE.DoubleSide,
        });

        child.userData.baseMaterial = baseMat;
        child.userData.wireMaterial = wireMat;

        // Start in base mode
        child.material = baseMat;
      });

      // Setup model root and loaded scene (match JSON structure)
      this.modelRoot = new THREE.Group();
      this.loadedScene = obj; // OBJLoader returns a Group already
      this.modelRoot.add(this.loadedScene);

      // IMPORTANT: Add OBJ to MATLAB frame root (applies Z-up → Y-up transform)
      // OBJ files exported from MATLAB are in Z-up coordinates and need conversion
      this.viewerCore.roots.matlab.add(this.modelRoot);

      // Emit mesh loaded event with statistics
      const stats = this.getMeshStatistics();
      this._emit('meshLoaded', { url, ...stats });

      return this.loadedScene;
    } catch (error) {
      console.error('[MeshManager] Failed to load OBJ:', error);
      this._emit('meshFailed', { url, error: error.message });
      throw error;
    }
  }

  /**
   * Clear the current model and dispose of resources
   * @param {boolean} silent - If true, don't emit meshCleared event (used during load)
   */
  clearModel(silent = false) {
    if (this.modelRoot) {
      // Remove from both possible frame roots (could be in either depending on file type)
      this.viewerCore.roots.threejs.remove(this.modelRoot);
      this.viewerCore.roots.matlab.remove(this.modelRoot);
      disposeObject3D(this.modelRoot);
    }
    this.modelRoot = null;
    this.loadedScene = null;
    
    // Only emit event if this is an explicit clear (not during load)
    if (!silent) {
      this._emit('meshCleared', {});
    }
  }

  /**
   * Get mesh statistics (vertex count, face count, bounds)
   * @returns {Object} Statistics object
   */
  getMeshStatistics() {
    let vertexCount = 0;
    let faceCount = 0;
    
    if (this.loadedScene) {
      this.loadedScene.traverse((obj) => {
        if (obj.isMesh && obj.geometry) {
          const pos = obj.geometry.attributes.position;
          if (pos) vertexCount += pos.count;
          
          const idx = obj.geometry.index;
          if (idx) {
            faceCount += idx.count / 3;
          } else if (pos) {
            faceCount += pos.count / 3;
          }
        }
      });
    }
    
    return {
      vertexCount,
      faceCount,
      bounds: this.getBounds()
    };
  }

  /**
   * Get the loaded scene (for picking, visualization, etc.)
   * @returns {THREE.Group|null}
   */
  getLoadedScene() {
    return this.loadedScene;
  }

  /**
   * Get the model root group
   * @returns {THREE.Group|null}
   */
  getModelRoot() {
    return this.modelRoot;
  }

  /**
   * Get the bounds of the loaded model
   * @returns {Object} - { radius: number, box: THREE.Box3, center: THREE.Vector3 }
   */
  getBounds() {
    if (!this.modelRoot) {
      return { radius: 100, box: null, center: new THREE.Vector3() };
    }

    const box = new THREE.Box3().setFromObject(this.modelRoot);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) / 2;

    return { radius, box, center };
  }

  /**
   * Set mesh from raw buffers (MATLAB pathway)
   * @param {Object} meshData - Mesh data object
   * @param {Array} meshData.vertices - Flat array [x1,y1,z1, x2,y2,z2, ...]
   * @param {Array} meshData.faces - Flat array of indices [i1,i2,i3, ...]
   * @param {Array} [meshData.normals] - (Optional) Flat array [nx1,ny1,nz1, nx2,ny2,nz2, ...]
   * @param {number} meshData.indexBase - 0 for 0-based indexing, 1 for 1-based
   * @param {string} meshData.frame - 'matlab' or 'threejs' coordinate frame
   * @returns {THREE.Group} - The loaded scene
   */
  setMeshFromBuffers(meshData) {
    const t0 = performance.now();
    const { vertices, faces, normals, indexBase = 0, frame = 'matlab' } = meshData;

    // Validate input
    if (!vertices || !faces) {
      throw new Error('setMeshFromBuffers requires vertices and faces arrays');
    }
    if (vertices.length % 3 !== 0) {
      throw new Error('vertices array length must be multiple of 3');
    }
    if (faces.length % 3 !== 0) {
      throw new Error('faces array length must be multiple of 3');
    }
    if (normals && normals.length !== vertices.length) {
      throw new Error('normals array length must match vertices array length');
    }

    // Clear any existing model
    this.clearModel();
    const t1 = performance.now();

    // Create BufferGeometry
    const geometry = new THREE.BufferGeometry();

    // Convert to Float32Array and Uint32Array
    const t2 = performance.now();
    const positionArray = new Float32Array(vertices);
    let indexArray = new Uint32Array(faces);

    // Convert to 0-based indexing if needed
    if (indexBase === 1) {
      indexArray = new Uint32Array(faces.map(idx => idx - 1));
    }

    // Set geometry attributes
    geometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
    geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
    
    // Add normals if provided (pre-computed from MATLAB)
    if (normals) {
      const normalArray = new Float32Array(normals);
      geometry.setAttribute('normal', new THREE.BufferAttribute(normalArray, 3));
    }
    
    const t3 = performance.now();

    // Validate geometry attributes (does NOT compute normals/UVs/tangents)
    // MATLAB (bct package) should provide pre-computed attributes via future setNormals() etc.
    const t4 = performance.now();
    validateGeometryAttributes(geometry);
    const t5 = performance.now();

    // Create materials (match GLB/JSON loading exactly)
    const baseMat = new THREE.MeshStandardMaterial({
      color: BASE_COLOR_HEX,
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      side: THREE.DoubleSide,
    });

    // Create mesh with base material
    const mesh = new THREE.Mesh(geometry, baseMat);
    
    // Store materials in userData
    mesh.userData.baseMaterial = baseMat;
    mesh.userData.wireMaterial = wireMat;

    // Setup model root and loaded scene (match GLB/JSON structure)
    this.modelRoot = new THREE.Group();
    this.loadedScene = new THREE.Group();
    this.loadedScene.add(mesh);
    this.modelRoot.add(this.loadedScene);

    // Add to appropriate root based on frame parameter
    if (frame === 'threejs') {
      this.viewerCore.roots.threejs.add(this.modelRoot);
    } else {
      // Default to matlab frame (applies Z-up → Y-up transform)
      this.viewerCore.roots.matlab.add(this.modelRoot);
    }

    const t6 = performance.now();

    return this.loadedScene;
  }
}

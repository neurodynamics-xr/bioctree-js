import * as THREE from "three";
import { PinMarker } from "./geometry/pinMarker.js";
import { PickingSystem } from "./interaction/picking.js";
import { SelectionFX } from "./interaction/selectionFX.js";
import { ViewerCore } from './core/viewerCore.js';
import { createLightingRig } from './core/lighting.js';
import { createVisualizationControls } from './ui/visualizationControls.js';
import { MeshManager } from './runtime/meshManager.js';
import { VisualizationManager } from './runtime/visualizationManager.js';
import { FieldManager } from './runtime/fieldManager.js';
import { ScalarMapper } from './visualization/scalarMapper.js';
import { Colorbar } from './ui/colorbar.js';
import { StateManager, StateEvent, AppState } from './core/stateManager.js';
import { GeodesicDistanceService } from './compute/geodesicDistanceService.js';
import { frameCameraToBounds } from './core/camera.js';

// Application state manager
let stateManager = null;

// Core rendering system
let viewerCore = null;

// Convenience accessors (populated by viewerCore)
let renderer, scene, camera, controls;
let canvas;

// Core subsystems
let lightRig = null;

// Runtime managers
let meshManager = null;
let vizManager = null;
let fieldManager = null;
let colorbar = null;

// Debug visuals
let targetMarker = null; // follows controls.target (rotation anchor)

// Interaction systems
let pickingSystem = null;
let selectionFX = null;
let pin = null;

// Geodesic computation service
let geodesicService = null;
let geodesicMode = false; // Toggle geodesic vs normal picking

/* -------------------- Defaults -------------------- */

// Pivot mode: recommended "MeshCenter" for FreeSurfer surfaces
const PIVOT_MODE = "MeshCenter";

// Debug toggles (initial state)
const SHOW_TARGET = false; // hide pivot marker

// Visualization state (lil-gui contract)
const vizState = {
  surface: {
    material: 'default'  // 'default' or 'wireframe'
  },
  edges: {
    color: '#ffffff'
  },
  helpers: {
    vertexNormals: false,
    tangents: false
  },
  scalar: {
    colormap: 'inferno',
    autoRange: true,
    colorbar: false
  }
};

// GUI instance
let vizGUI = null;

/* -------------------- Viewer Initialization -------------------- */

export async function initViewer({ canvasEl, hudEl, glbUrl = null }) {
  canvas = canvasEl;

  // Initialize state manager
  stateManager = new StateManager();
  
  // Subscribe to state changes for debugging
  stateManager.on('*', (event, currentState, previousState) => {
    console.log('[StateManager]', event, ':', {
      appState: previousState.state + ' → ' + currentState.state,
      meshStatus: previousState.mesh?.status + ' → ' + currentState.mesh?.status,
      dataStatus: previousState.data?.status + ' → ' + currentState.data?.status
    });
  });

  // Initialize core rendering system (WebGPU requires async)
  viewerCore = new ViewerCore(canvas);
  await viewerCore.init({
    backgroundColor: 0x000000,
    cameraConfig: {
      fov: 45,
      near: 0.01,
      far: 1e7,
      position: [0, 0, 300],
      up: [0, 1, 0]
    },
    controlsConfig: {
      enableDamping: true,
      dampingFactor: 0.08,
      target: [0, 0, 0],
      cameraPosition: [-300, 0, 0]  // Default: +Z (blue) points right
    }
  });

  // Extract convenience accessors
  scene = viewerCore.scene;
  camera = viewerCore.camera;
  renderer = viewerCore.renderer;
  controls = viewerCore.controls;

  console.log('[Viewer] WebGPU renderer backend:', renderer.backend);

  // Initialize lighting rig
  lightRig = createLightingRig(camera);

  // Initialize runtime managers
  meshManager = new MeshManager(viewerCore);
  vizManager = new VisualizationManager(viewerCore, meshManager, lightRig);
  
  // Initialize colorbar UI overlay (needed by FieldManager)
  colorbar = new Colorbar(canvas.parentElement);
  
  // Initialize FieldManager (needs meshManager, colorbar, vizState)
  fieldManager = new FieldManager(meshManager, colorbar, vizState);
  
  // Connect MeshManager events to StateManager (Observer pattern)
  // Must be done AFTER meshManager is created
  meshManager.on('meshLoadStarted', ({ url }) => {
    console.log('[MeshManager] meshLoadStarted:', url);
    const requestId = stateManager.generateRequestId();
    stateManager.dispatch(StateEvent.LOAD_MESH_REQUESTED, { requestId });
  });

  meshManager.on('meshLoaded', ({ url, vertexCount, faceCount, bounds }) => {
    console.log('[MeshManager] meshLoaded:', { vertexCount, faceCount });
    
    // Scale pin marker to mesh size
    if (pin && bounds && bounds.radius) {
      pin.setScale(bounds.radius);
    }
    
    stateManager.dispatch(StateEvent.LOAD_MESH_SUCCEEDED, {
      requestId: stateManager.mesh.requestId, // Use the stored requestId
      vertexCount,
      faceCount,
      bounds
    });
    
    // NOTE: Geodesic service is NOT initialized automatically to avoid slowing down mesh loading.
    // It will be initialized on-demand when first needed (e.g., when user enables picking mode).
    // To manually initialize: call initializeGeodesicService() after mesh is loaded
  });

  meshManager.on('meshFailed', ({ url, error }) => {
    console.log('[MeshManager] meshFailed:', error);
    stateManager.dispatch(StateEvent.LOAD_MESH_FAILED, { error });
  });

  meshManager.on('meshCleared', () => {
    console.log('[MeshManager] meshCleared');
    stateManager.dispatch(StateEvent.CLEAR_MESH_REQUESTED, {});
  });
  
  // Connect FieldManager events to StateManager (Observer pattern)
  fieldManager.on('fieldLoadStarted', ({ name, type }) => {
    console.log('[FieldManager] fieldLoadStarted:', name, type);
    const requestId = stateManager.generateRequestId();
    stateManager.dispatch(StateEvent.LOAD_DATA_REQUESTED, { requestId });
  });

  fieldManager.on('fieldLoaded', ({ name, type, count, range }) => {
    console.log('[FieldManager] fieldLoaded:', { name, type, count, range });
    stateManager.dispatch(StateEvent.LOAD_DATA_SUCCEEDED, {
      requestId: stateManager.data.requestId,
      type,
      count,
      range
    });
  });

  fieldManager.on('fieldFailed', ({ name, type, error }) => {
    console.log('[FieldManager] fieldFailed:', error);
    stateManager.dispatch(StateEvent.LOAD_DATA_FAILED, { error });
  });

  fieldManager.on('fieldCleared', ({ name, type }) => {
    console.log('[FieldManager] fieldCleared:', name, type);
    stateManager.dispatch(StateEvent.CLEAR_DATA_REQUESTED, {});
  });

  // Pivot marker (optional)
  if (SHOW_TARGET) installTargetMarker();
  updateTargetMarker();

  // Setup resize observation
  viewerCore.setupResizeObserver();

  // Wire up controls change callbacks
  viewerCore.onControlsChange(() => {
    updateTargetMarker();
  });
  
  // Initialize picking system
  pickingSystem = new PickingSystem(camera, renderer);
  
  // Start with picking disabled (tools must be explicitly activated)
  pickingSystem.setEnabled(false);
  
  // Initialize selection FX
  selectionFX = new SelectionFX();
  
  // Initialize pin marker for vertex selection
  // Uses proportional sizing (fractions of mesh radius)
  pin = new PinMarker(scene, renderer, {
    color: 0xffcc00,
    length: 0.15,        // 15% of mesh radius
    headRadius: 0.02,    // 2% of mesh radius
    lineWidthPx: 2.5
  });
  
  // Wire up picking callbacks
  pickingSystem.onTrianglePick = (hit, tri) => {
    if (!geodesicMode) {
      selectionFX.showTriangle(hit.object, tri);
    }
  };
  
  pickingSystem.onEdgePick = (hit, edge, tri) => {
    if (!geodesicMode) {
      selectionFX.showEdge(hit.object, hit.point, tri);
    }
  };
  
  pickingSystem.onVertexPick = (hit, vertexIdx, tri) => {
    if (geodesicMode) {
      // Geodesic mode: toggle source vertex and compute
      handleGeodesicVertexClick(vertexIdx, hit.object);
    } else {
      // Normal mode: show pin
      pin.setFromVertexIndex(hit.object, vertexIdx, camera);
    }
  };
  
  // Picking: pointer event handler
  viewerCore.getRendererElement().addEventListener("pointerdown", (evt) => {
    pickingSystem.handlePointerDown(evt);
  });

  // Register render callbacks
  viewerCore.onRender(() => {
    updateTargetMarker();
    
    // Update selection pulse animation
    const t = performance.now() / 1000;
    selectionFX?.updatePulse(t);
    pin?.updatePulse(t);
    
    // Resize pin on viewport changes
    pin?.onResize();

    // Update normals/tangents helpers if active (via vizManager)
    vizManager?.updateNormalsHelpers();
    vizManager?.updateTangentsHelpers();
  });

  // Start render loop
  viewerCore.start();
  
  // Create visualization controls GUI (contained within canvas container)
  try {
    vizGUI = createVisualizationControls({
      vizState,
      container: canvas.parentElement, // Append to ViewerCanvas container
      onChange: () => {
        try {
          vizManager?.applyState(vizState);
          // Update colorbar visibility
          colorbar?.setVisible(vizState.scalar.colorbar);
          // Re-apply field data with new colormap if colormap changed
          if (fieldManager?.hasField()) {
            fieldManager.updateColormap(vizState.scalar.colormap);
          }
        } catch (err) {
          console.error('[Viewer] onChange error:', err);
        }
      }
    });
    
    // Give FieldManager access to vizGUI for updating checkbox states
    if (vizGUI && fieldManager) {
      fieldManager.setVizGUI(vizGUI);
    }
  } catch (err) {
    console.error('[Viewer] GUI creation failed:', err);
    console.error('[Viewer] Stack:', err.stack);
  }
  
  // Initial visualization sync
  try {
    vizManager?.applyState(vizState);
  } catch (err) {
    console.error('[Viewer] Initial applyState failed:', err);
    console.error('[Viewer] Stack:', err.stack);
  }
  
  // Load default mesh only if glbUrl is provided
  if (glbUrl) {
    loadGLB(glbUrl).catch((err) => {
      console.error(err);
    });
  }
}

/**
 * Handle post-load setup (shared by all loaders)
 * @private
 */
function handlePostLoad() {
  const loadedScene = meshManager.getLoadedScene();
  const bounds = meshManager.getBounds();

  // Set orbit pivot
  setPivotMode(PIVOT_MODE);
  
  // Frame camera to fit loaded mesh
  frameCameraToBounds(camera, controls, bounds, 1.5);
  
  // Apply visualization state
  vizManager?.applyState(vizState);
  
  // Update debug visuals
  updateTargetMarker();
  
  // Setup picking
  pickingSystem?.collectPickables(loadedScene);
  
  // Scale pin to mesh size
  if (pin) {
    pin.setLength(bounds.radius * 0.1);
  }
}

export async function loadGLB(url) {
  console.log('[render] Loading GLB:', url);
  
  // Just delegate to MeshManager - it will emit events that StateManager listens to
  await meshManager.loadGLB(url);
  const scene = meshManager.getLoadedScene();
  handlePostLoad();
  
  console.log('[render] GLB loaded successfully:', url);
  return scene;
}

export async function loadOBJ(url) {
  console.log('[render] Loading OBJ:', url);
  
  // Just delegate to MeshManager - it will emit events that StateManager listens to
  await meshManager.loadOBJ(url);
  const scene = meshManager.getLoadedScene();
  handlePostLoad();
  
  console.log('[render] OBJ loaded successfully:', url);
  return scene;
}

/**
 * Load model from URL - detects file type and uses appropriate loader
 * @param {string} url - Path to model file (.glb, .gltf, .json, or .obj)
 * @param {string} [extension] - Optional file extension (for blob URLs without extensions)
 */
export async function loadModel(url, extension) {
  // Extract extension from URL or use provided extension
  const ext = (extension || url.split('.').pop()).toLowerCase();
  
  if (ext === 'glb' || ext === 'gltf') {
    return loadGLB(url);
  } else if (ext === 'json') {
    return loadJSON(url);
  } else if (ext === 'obj') {
    return loadOBJ(url);
  } else {
    throw new Error(`Unsupported file format: ${ext}`);
  }
}

/**
 * Load JSON geometry file
 * @param {string} url - Path to JSON geometry file
 */
export async function loadJSON(url) {
  console.log('[render] Loading JSON:', url);
  
  if (!stateManager) {
    console.error('[loadJSON] StateManager not initialized');
    return;
  }

  try {
    // Dispatch load requested event
    const requestId = stateManager.generateRequestId();
    stateManager.dispatch(StateEvent.LOAD_MESH_REQUESTED, { requestId });
    
    await meshManager.loadJSON(url);
    const scene = meshManager.getLoadedScene();
    handlePostLoad();
    
    // Get mesh statistics
    let vertexCount = 0;
    let faceCount = 0;
    if (scene) {
      scene.traverse(obj => {
        if (obj.isMesh && obj.geometry) {
          const pos = obj.geometry.attributes.position;
          if (pos) vertexCount += pos.count;
          const idx = obj.geometry.index;
          if (idx) faceCount += idx.count / 3;
        }
      });
    }
    
    const bounds = meshManager.getBounds();
    stateManager.dispatch(StateEvent.LOAD_MESH_SUCCEEDED, {
      requestId,
      vertexCount,
      faceCount,
      bounds
    });
    
    console.log('[render] JSON loaded successfully:', url);
    return scene;
  } catch (err) {
    console.error('[loadJSON] Error loading JSON:', err);
    stateManager.dispatch(StateEvent.LOAD_MESH_FAILED, { error: err.message });
    throw err;
  }
}

/* -------------------- Picking API -------------------- */

export function setPickMode(mode) {
  pickingSystem?.setMode(mode);
}

export function setPickingEnabled(enabled) {
  pickingSystem?.setEnabled(enabled);
}

/**
 * Set custom callbacks for picking events
 * @param {Object} callbacks - Callback functions
 * @param {Function} [callbacks.onVertexPick] - Called with (vertexIdx, hit, tri)
 * @param {Function} [callbacks.onEdgePick] - Called with (edge, hit, tri)
 * @param {Function} [callbacks.onTrianglePick] - Called with (tri, hit)
 */
export function setPickCallbacks(callbacks) {
  if (!pickingSystem) return;
  
  if (callbacks.onVertexPick) {
    const userCallback = callbacks.onVertexPick;
    pickingSystem.onVertexPick = (hit, vertexIdx, tri) => {
      if (geodesicMode) {
        handleGeodesicVertexClick(vertexIdx, hit.object);
      } else {
        pin.setFromVertexIndex(hit.object, vertexIdx, camera);
        userCallback(vertexIdx, hit, tri);
      }
    };
  }
  
  if (callbacks.onEdgePick) {
    const userCallback = callbacks.onEdgePick;
    pickingSystem.onEdgePick = (hit, edge, tri) => {
      if (!geodesicMode) {
        selectionFX.showEdge(hit.object, hit.point, tri);
        userCallback(edge, hit, tri);
      }
    };
  }
  
  if (callbacks.onTrianglePick) {
    const userCallback = callbacks.onTrianglePick;
    pickingSystem.onTrianglePick = (hit, tri) => {
      if (!geodesicMode) {
        selectionFX.showTriangle(hit.object, tri);
        userCallback(tri, hit);
      }
    };
  }
}

/**
 * Set mesh from raw data (MATLAB pathway)
 * @param {Object} meshData - Mesh data object
 * @param {Array} meshData.vertices - Flat array [x1,y1,z1, x2,y2,z2, ...]
 * @param {Array} meshData.faces - Flat array of indices [i1,i2,i3, ...]
 * @param {number} meshData.indexBase - 0 for 0-based indexing, 1 for 1-based
 * @param {string} meshData.frame - 'matlab' or 'threejs' coordinate frame
 */
export function setMeshFromData(meshData) {
  const tTotal = performance.now();
  
  if (!meshManager || !stateManager) {
    console.error('[setMeshFromData] Viewer not initialized. Call initViewer first.');
    return;
  }

  // Check if loading is allowed
  if (!stateManager.canPerformAction(StateEvent.LOAD_MESH_REQUESTED)) {
    console.warn('[setMeshFromData] Cannot load mesh in current state:', stateManager.getState());
    return;
  }

  try {
    // Dispatch load requested event
    const requestId = stateManager.generateRequestId();
    stateManager.dispatch(StateEvent.LOAD_MESH_REQUESTED, { requestId });
    
    // Load mesh from buffers
    const t0 = performance.now();
    meshManager.setMeshFromBuffers(meshData);
    const t1 = performance.now();
    
    // Get mesh info for state update
    const loadedScene = meshManager.getLoadedScene();
    let vertexCount = 0;
    let faceCount = 0;
    if (loadedScene) {
      loadedScene.traverse(obj => {
        if (obj.isMesh && obj.geometry) {
          const pos = obj.geometry.attributes.position;
          if (pos) vertexCount += pos.count;
          const idx = obj.geometry.index;
          if (idx) faceCount += idx.count / 3;
        }
      });
    }
    
    // Run post-load setup
    const t2 = performance.now();
    handlePostLoad();
    const t3 = performance.now();
    
    // Dispatch load succeeded event
    const bounds = meshManager.getBounds();
    stateManager.dispatch(StateEvent.LOAD_MESH_SUCCEEDED, {
      requestId,
      vertexCount,
      faceCount,
      bounds
    });
    
    const tEnd = performance.now();
  } catch (err) {
    console.error('[setMeshFromData] Error loading mesh:', err);
    stateManager.dispatch(StateEvent.LOAD_MESH_FAILED, { error: err.message });
  }
}

/**
 * Clear the current mesh from the viewer
 * Called from MATLAB via HTMLComponent.Data = {clearMesh: true}
 */
export function clearMesh() {
  if (!meshManager || !stateManager) {
    console.error('[clearMesh] Viewer not initialized');
    return;
  }

  try {
    // Dispatch clear mesh event
    stateManager.dispatch(StateEvent.CLEAR_MESH_REQUESTED);
    
    // Clear field data first
    if (fieldManager) {
      fieldManager.clearField();
    }
    
    // Clear the mesh
    meshManager.clearModel();
  } catch (err) {
    console.error('[clearMesh] Error clearing mesh:', err);
  }
}

/**
 * Set scalar data for color mapping
 * Called from MATLAB via HTMLComponent.Data = {scalar: scalarData}
 * @param {Object} scalarData - Scalar field configuration
 * @param {string} scalarData.action - 'update' or 'clear'
 * @param {Array} [scalarData.data] - Flat array of scalar values
 */
export function setScalarData(scalarData) {
  if (!fieldManager || !stateManager) {
    console.error('[setScalarData] Viewer not initialized');
    return;
  }

  try {
    if (scalarData.action === 'clear') {
      // Delegate to FieldManager - it will emit events that StateManager listens to
      fieldManager.clearField();
      
      // Update GUI to reflect the state change
      if (vizGUI) {
        vizGUI.updateDisplay();
      }
    } else if (scalarData.action === 'update') {
      // Delegate to FieldManager - it will emit events that StateManager listens to
      const { data, name = 'unnamed_field' } = scalarData;
      
      if (!data || data.length === 0) {
        console.error('[setScalarData] No scalar data provided');
        return;
      }

      fieldManager.loadScalarField({ name, data });
      
      // Update GUI to reflect the state change
      if (vizGUI && typeof vizGUI.updateDisplay === 'function') {
        vizGUI.updateDisplay();
      }
    }
  } catch (err) {
    console.error('[setScalarData] Error setting scalar data:', err);
    console.error('[setScalarData] Stack trace:', err.stack);
  }
}

/**
 * Get WebGPU device from renderer for buffer sharing with compute shaders
 * @returns {GPUDevice | null} GPU device or null if not initialized
 */
export function getGPUDevice() {
  if (!renderer || !renderer.backend) {
    console.error('[getGPUDevice] Renderer not initialized');
    return null;
  }
  
  const device = renderer.backend.device;
  if (!device) {
    console.error('[getGPUDevice] WebGPU device not available from renderer backend');
    return null;
  }
  
  return device;
}

/**
 * Get WebGPU renderer for TSL compute integration
 * @returns {Object | null} Renderer or null if not initialized
 */
export function getRenderer() {
  if (!renderer) {
    console.error('[getRenderer] Renderer not initialized');
    return null;
  }
  return renderer;
}

/**
 * Trigger TSL compute node execution
 * @param {Object} computeNode - TSL compute node from Fn().compute()
 */
export function executeCompute(computeNode) {
  if (!renderer) {
    console.error('[executeCompute] Renderer not initialized');
    return;
  }
  
  try {
    renderer.compute(computeNode);
  } catch (error) {
    console.error('[executeCompute] Failed to execute compute node:', error);
    throw error;
  }
}

/* -------------------- Pivot control -------------------- */

function setPivotMode(mode) {
  if (!controls) return;

  if (mode === "WorldOrigin") {
    controls.target.set(0, 0, 0);
  } else {
    const modelRoot = meshManager?.getModelRoot();
    if (modelRoot) {
      const center = new THREE.Box3().setFromObject(modelRoot).getCenter(new THREE.Vector3());
      controls.target.copy(center);
    } else {
      controls.target.set(0, 0, 0);
    }
  }

  // Keep your canonical view direction relative to pivot
  const t = controls.target;
  camera.position.set(t.x - 300, t.y, t.z);
  camera.lookAt(t);

  controls.update();
  updateTargetMarker();
}

/* -------------------- Pivot marker -------------------- */

function installTargetMarker() {
  if (targetMarker) scene.remove(targetMarker);

  const geom = new THREE.SphereGeometry(4.0, 16, 16);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
  targetMarker = new THREE.Mesh(geom, mat);
  targetMarker.position.copy(controls?.target ?? new THREE.Vector3());
  scene.add(targetMarker);
}

function updateTargetMarker() {
  if (!targetMarker || !controls) return;
  targetMarker.position.copy(controls.target);
}

/* -------------------- State Manager Access -------------------- */

/**
 * Get current application state (for debugging)
 * @returns {string} Current app state
 */
export function getAppState() {
  return stateManager?.getState() || 'uninitialized';
}

/**
 * Get full state snapshot (for debugging)
 * @returns {Object} Complete state snapshot
 */
export function getStateSnapshot() {
  return stateManager?.getSnapshot() || null;
}

/**
 * Get state transition history (for debugging)
 * @returns {Array} State transition history
 */
export function getStateHistory() {
  return stateManager?.getHistory() || [];
}

/**
 * Subscribe to state changes
 * @param {Function} callback - Called with (event, currentState, previousState)
 * @returns {Function} Unsubscribe function
 */
export function subscribeToState(callback) {
  if (!stateManager) {
    console.warn('[render] Cannot subscribe: stateManager not initialized');
    return () => {};
  }
  return stateManager.on('*', callback);
}

/**
 * Get mesh metadata from loaded mesh
 * @returns {Object|null} Mesh metadata or null if no mesh loaded
 */
export function getMeshMetadata() {
  if (!meshManager) return null;
  
  const scene = meshManager.getLoadedScene();
  if (!scene) return null;
  
  const snapshot = stateManager?.getSnapshot();
  return snapshot?.mesh || null;
}

/* -------------------- Geodesic Distance Integration -------------------- */

/**
 * Initialize geodesic service from current mesh
 */
function initializeGeodesicService() {
  console.log('[Viewer] Initializing geodesic service...');
  
  // Check if library is loaded
  if (typeof HeatMethod === 'undefined') {
    console.warn('[Viewer] geometry-processing-js not loaded - geodesic features disabled');
    return;
  }
  
  // Check if memoryManager exists
  if (typeof memoryManager === 'undefined') {
    console.error('[Viewer] Global memoryManager not initialized - geodesic features disabled');
    console.error('[Viewer] This should have been created in index.html after library scripts');
    return;
  } else {
    console.log('[Viewer] Global memoryManager found - ready for geodesic computation');
  }
  
  const mesh = meshManager?.modelRoot?.getObjectByProperty('isMesh', true);
  if (!mesh || !mesh.geometry) {
    console.warn('[Viewer] No mesh geometry available for geodesic initialization');
    return;
  }
  
  geodesicService = new GeodesicDistanceService();
  const success = geodesicService.initialize(mesh.geometry);
  
  if (success) {
    console.log('[Viewer] Geodesic service ready - vertex count:', geodesicService.mesh.vertices.length);
  } else {
    console.error('[Viewer] Failed to initialize geodesic service');
    geodesicService = null;
  }
}

function handleGeodesicVertexClick(vertexIdx, meshObject) {
  if (!geodesicService) return;
  
  const shiftKey = pickingSystem?.shiftKey || false;
  const changed = shiftKey 
    ? geodesicService.removeSourceVertex(vertexIdx)
    : geodesicService.addSourceVertex(vertexIdx);
  
  if (changed) computeAndVisualizeGeodesic(meshObject);
}

function computeAndVisualizeGeodesic(meshObject) {
  if (!geodesicService) return;
  
  const result = geodesicService.compute();
  if (!result) {
    clearGeodesicVisualization(meshObject);
    return;
  }
  
  if (typeof colormap === 'undefined' || typeof hot === 'undefined') {
    console.error('[Viewer] colormap utilities not loaded');
    return;
  }
  
  const colors = geodesicService.getColors(colormap, hot);
  if (!colors) return;
  
  const geometry = meshObject.geometry;
  if (!geometry.attributes.color) {
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  } else {
    geometry.attributes.color.array.set(colors);
    geometry.attributes.color.needsUpdate = true;
  }
  
  if (meshObject.material) {
    meshObject.material.vertexColors = true;
    meshObject.material.needsUpdate = true;
  }
}

function clearGeodesicVisualization(meshObject) {
  const geometry = meshObject?.geometry;
  if (!geometry || !geometry.attributes.color) return;
  
  const colors = geometry.attributes.color.array;
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = 1.0;
    colors[i + 1] = 0.5;
    colors[i + 2] = 0.0;
  }
  geometry.attributes.color.needsUpdate = true;
}

export function setGeodesicMode(enabled) {
  geodesicMode = enabled;
  console.log('[Viewer] Geodesic mode:', enabled ? 'ENABLED' : 'DISABLED');
  
  if (!enabled && geodesicService) {
    geodesicService.clearSources();
    const mesh = meshManager?.modelRoot?.getObjectByProperty('isMesh', true);
    if (mesh) clearGeodesicVisualization(mesh);
  }
}

export function getGeodesicState() {
  return geodesicService?.getState() || {
    initialized: false,
    vertexCount: 0,
    sourceCount: 0,
    sources: [],
    hasResult: false,
    range: null
  };
}

/**
 * render.ts
 * 
 * Main orchestrator for WebGPU viewer.
 * Manages renderer, scene, camera, controls, and subsystems.
 */

import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { texture, positionLocal, uniform, float } from 'three/tsl';
import { createScene } from './scene';
import { createCamera, resizeCamera } from './camera';
import { createLightingRig } from './lighting';
import { initPicking, setPickingEnabled, setPickingCallback, isPickingEnabled } from './interaction';
import { createColormapNode, FloatToColormap, getColormapIndex, type ColormapType } from '../../tsl/colormap';
import { GPUResourceManager } from '../../gpu/GPUResourceManager';
import type { Manifold } from '../../manifold/Manifold';
import { initEigenmodeVisualization, addVertexIdAttribute, type EigenmodeVisualizationParams } from '../../compute/spectral/eigenmodeVisualization';
import type { ScalarField } from '../../tsl/types';

// Core components
let renderer: THREE.WebGPURenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null;
let controls: OrbitControls | null = null;
let gpu: GPUResourceManager | null = null; // GPU resource manager

// Scene roots
let roots: { world: THREE.Group; overlay: THREE.Group; debug: THREE.Group } | null = null;

// Mesh state
let mesh: THREE.Mesh | null = null;
let material: THREE.MeshStandardNodeMaterial | null = null;

// Colormap atlas texture (cached)
let colormapAtlasTex: THREE.Texture | null = null;

// Active field (for procedural fields like fractal noise)
let activeField: ScalarField | null = null;

// Active visualization state
interface VisualizationState {
  scalarSource: 'none' | 'fieldBuffer' | 'eigenmode' | 'fractalNoise';
  bufferKey: string | null;
  colormapIndex: number;
  colormapName: ColormapType;
  minValue: number;
  maxValue: number;
}

let vizState: VisualizationState = {
  scalarSource: 'none',
  bufferKey: null,
  colormapIndex: 0,
  colormapName: 'viridis',
  minValue: -1,
  maxValue: 1
};

// Eigenmode visualization state
let eigenmodeViz: {
  setParams: (params: Partial<EigenmodeVisualizationParams>) => void;
  dispose: () => void;
} | null = null;

// Animation loop
let animationId: number | null = null;
let animationPaused: boolean = false;

// Custom time uniform for controllable animation
const customTime = uniform(0);
let lastTime: number = 0;
let accumulatedTime: number = 0;

/**
 * Initialize the WebGPU viewer
 */
export async function init(canvasEl: HTMLCanvasElement, config?: {
  backgroundColor?: number;
  cameraConfig?: any;
}): Promise<void> {
  const { backgroundColor = 0x000000, cameraConfig = {} } = config || {};

  // Create WebGPU renderer
  renderer = new THREE.WebGPURenderer({
    canvas: canvasEl,
    antialias: true,
    alpha: false
  });
  await renderer.init();
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(canvasEl.clientWidth, canvasEl.clientHeight);

  // Initialize GPU resource manager
  gpu = new GPUResourceManager({ retainCpu: true }); // Retain CPU for dev/picking

  // Create scene
  const sceneData = createScene({ backgroundColor });
  scene = sceneData.scene;
  roots = sceneData.roots;

  // Create camera
  const aspect = canvasEl.clientWidth / canvasEl.clientHeight;
  camera = createCamera(cameraConfig, aspect);

  // Create lighting rig (attached to camera)
  createLightingRig(camera);

  // Add camera to scene (required for camera-attached lights to work)
  scene.add(camera);

  // Create orbit controls
  controls = new OrbitControls(camera, canvasEl);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = false;
  controls.minDistance = 0.1;
  controls.maxDistance = 2000;

  // Initialize picking system
  initPicking(canvasEl, camera, () => mesh);

  // Preload colormap atlas texture
  const atlasTexture = getColormapAtlasTexture();
  if (atlasTexture) {
    // Wait for texture to load before continuing
    await new Promise<void>((resolve) => {
      if (atlasTexture.image && (atlasTexture.image as HTMLImageElement).complete) {
        resolve();
      } else {
        const checkLoaded = () => {
          if (atlasTexture.image && (atlasTexture.image as HTMLImageElement).complete) {
            resolve();
          } else {
            requestAnimationFrame(checkLoaded);
          }
        };
        checkLoaded();
      }
    });
  }

  // Start animation loop
  animate();

}

/**
 * Animation loop
 */
function animate(): void {
  animationId = requestAnimationFrame(animate);
  
  // Update time only when not paused
  if (!animationPaused) {
    const now = performance.now() / 1000; // Convert to seconds
    if (lastTime === 0) {
      lastTime = now;
    }
    const delta = now - lastTime;
    lastTime = now;
    accumulatedTime += delta;
    customTime.value = accumulatedTime;
  }

  if (controls) {
    controls.update();
  }

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

/**
 * Pause animation (time stops but rendering continues)
 */
export function stopAnimation(): void {
  animationPaused = true;
}

/**
 * Resume animation
 */
export function startAnimation(): void {
  animationPaused = false;
}

/**
 * Check if animation is running (not paused)
 */
export function isAnimating(): boolean {
  return !animationPaused;
}

/**
 * Check if fractal noise field is currently active
 */
export function isFractalNoiseActive(): boolean {
  return activeField !== null && vizState.scalarSource === 'fractalNoise';
}

/**
 * Handle window/canvas resize
 * Called by React ResizeObserver (not window listener)
 */
export function resize(width: number, height: number): void {
  if (!renderer || !camera) return;

  const aspect = width / height;

  renderer.setSize(width, height);
  resizeCamera(camera, aspect);
}

/**
 * Set mesh from Manifold object (NEW: GPU-managed)
 * 
 * Uses GPUResourceManager for one-time upload and deduplication.
 * Replaces direct typed array manipulation with managed resources.
 */
export function setMeshFromManifold(manifold: Manifold): void {
  if (!renderer || !scene || !roots || !gpu) {
    throw new Error('Viewer not initialized');
  }


  // Get or create geometry through GPU resource manager
  const descriptor = gpu.getOrCreateManifoldGeometry(manifold);
  const geometry = descriptor.geometry;

  // Create material once if not exists
  if (!material) {
    material = new THREE.MeshStandardNodeMaterial({
      roughness: 0.5,
      metalness: 0.1,
      flatShading: false
    });
  }

  // Create or update mesh
  if (mesh) {
    // Replace geometry, keep material
    roots.world.remove(mesh);
    const oldGeometry = mesh.geometry;
    mesh.geometry = geometry;
    roots.world.add(mesh);
    oldGeometry.dispose();
  } else {
    // Create new mesh
    mesh = new THREE.Mesh(geometry, material);
    roots.world.add(mesh);
  }

  // Reset visualization state when loading new manifold
  vizState.scalarSource = 'none';
  vizState.bufferKey = null;
  
  // Apply default color if no field active
  if (material && vizState.scalarSource === 'none') {
    material.colorNode = null; // Reset to default material color
    material.color.setHex(0xe6f7f7);
  }

  // Center camera on mesh (account for worldRoot transform)
  if (camera && controls) {
    // Use worldRoot (transformed group) for bounding box calculation
    const box = new THREE.Box3().setFromObject(roots.world);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    controls.target.copy(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    camera.position.copy(center).add(new THREE.Vector3(0, 0, maxDim * 2));
    camera.lookAt(center);
    controls.update();
  }

}

/**
 * Get the current mesh
 */
export function getMesh(): THREE.Mesh | null {
  return mesh;
}

/**
 * Get the current material
 */
export function getMaterial(): THREE.MeshStandardNodeMaterial | null {
  return material;
}

/**
 * Get or load the colormap atlas texture
 */
function getColormapAtlasTexture(): THREE.Texture | null {
  if (!gpu) return null;
  
  if (!colormapAtlasTex) {
    colormapAtlasTex = gpu.getOrCreateTexture(
      'colormap_atlas',
      '/colormaps_atlas.png',
      {
        colorSpace: 'srgb',
        filtering: 'linear',
        wrapping: 'clamp',
        generateMipmaps: false
      }
    );
  }
  
  return colormapAtlasTex;
}

/**
 * Get the GPU resource manager
 */
export function getGPU(): GPUResourceManager | null {
  return gpu;
}

/**
 * Get the WebGPU renderer
 */
export function getRenderer(): THREE.WebGPURenderer | null {
  return renderer;
}

/**
 * Get the camera
 */
export function getCamera(): THREE.PerspectiveCamera | THREE.OrthographicCamera | null {
  return camera;
}

/**
 * Get the scene
 */
export function getScene(): THREE.Scene | null {
  return scene;
}

/**
 * Get the scene roots
 */
export function getRoots(): { world: THREE.Group; overlay: THREE.Group; debug: THREE.Group } | null {
  return roots;
}

/**
 * Dispose of all resources
 */
export function dispose(): void {
  // Stop animation
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  // Dispose mesh
  if (mesh) {
    mesh.geometry.dispose();
    if (mesh.material instanceof THREE.Material) {
      mesh.material.dispose();
    }
    mesh = null;
  }

  // Dispose controls
  if (controls) {
    controls.dispose();
    controls = null;
  }

  // Dispose renderer
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }

  scene = null;
  camera = null;
  roots = null;

}

/**
 * Enable/disable vertex picking
 */
export function enablePicking(enabled: boolean): void {
  setPickingEnabled(enabled);
}

/**
 * Set callback for vertex pick events
 */
export function onVertexPick(
  callback: ((vertexIndex: number, position: THREE.Vector3) => void) | null
): void {
  setPickingCallback(callback);
}

/**
 * Check if picking is enabled
 */
export function pickingEnabled(): boolean {
  return isPickingEnabled();
}

/**
 * Apply field colormap to mesh material (atlas-based)
 * 
 * @param scalarStorage - TSL storage buffer containing scalar values
 * @param colormap - Colormap type
 * @param minValue - Minimum scalar value
 * @param maxValue - Maximum scalar value
 */
export function setFieldColormap(
  scalarStorage: any,
  colormap: ColormapType,
  minValue: number,
  maxValue: number
): void {
  if (!mesh || !material) {
    return;
  }


  // Get atlas texture
  const atlasTex = getColormapAtlasTexture();
  if (!atlasTex) {
    return;
  }

  // Create colormap node using TSL atlas-based function
  const atlasNode = texture(atlasTex);
  const colormapNode = createColormapNode(
    scalarStorage,
    atlasNode,
    colormap,
    minValue,
    maxValue
  );

  // Update material with colormap
  material.colorNode = colormapNode;
  material.needsUpdate = true;
}

/**
 * Clear field colormap and restore default material color
 */
export function clearFieldColormap(): void {
  if (!mesh) {
    return;
  }


  // Restore default color
  const material = mesh.material as THREE.MeshStandardNodeMaterial;
  material.colorNode = null;
  material.color.setHex(0xe6f7f7); // Default color
  material.needsUpdate = true;
}

/**
 * Enable eigenmode visualization for current manifold
 * This is the SIMPLE approach - no compute, just sample eigenvector in shader
 */
export async function enableEigenmodeVisualization(
  manifold: Manifold,
  initialMode: number = 0
): Promise<void> {
  if (!mesh || !gpu || !renderer) {
    throw new Error('Viewer not initialized or no mesh loaded');
  }

  if (!manifold.eigenmodes) {
    throw new Error('Manifold does not have eigenmodes');
  }


  // Dispose existing eigenmode viz if any
  if (eigenmodeViz) {
    eigenmodeViz.dispose();
    eigenmodeViz = null;
  }

  // Add vertexId attribute to geometry (no longer needed - using built-in vertexIndex)
  addVertexIdAttribute(mesh.geometry);

  // Initialize eigenmode visualization
  const viz = await initEigenmodeVisualization(manifold, gpu, initialMode);
  eigenmodeViz = viz;

  // Replace mesh material with eigenmode material
  const oldMaterial = mesh.material;
  mesh.material = viz.material;
  
  // Dispose old material
  if (oldMaterial instanceof THREE.Material) {
    oldMaterial.dispose();
  }

}

/**
 * Update eigenmode visualization parameters
 */
export function setEigenmodeVisualizationParams(params: Partial<EigenmodeVisualizationParams>): void {
  if (!eigenmodeViz) {
    return;
  }

  eigenmodeViz.setParams(params);
}

/**
 * Disable eigenmode visualization and restore default material
 */
export function disableEigenmodeVisualization(): void {
  if (!eigenmodeViz || !mesh) {
    return;
  }


  // Dispose eigenmode viz
  eigenmodeViz.dispose();
  eigenmodeViz = null;

  // Restore default material
  const material = new THREE.MeshStandardNodeMaterial({
    color: 0xe6f7f7,
    roughness: 0.5,
    metalness: 0.1,
    flatShading: false
  });

  const oldMaterial = mesh.material;
  mesh.material = material;

  // Dispose old material
  if (oldMaterial instanceof THREE.Material) {
    oldMaterial.dispose();
  }

}

/**
 * ================================================================================
 * Interactive Visualization API
 * ================================================================================
 * 
 * These methods provide fine-grained control over visualization parameters
 * without recreating the entire material or mesh.
 */

/**
 * Set colormap by index (0-15)
 */
export function setColormapIndex(index: number): void {
  if (index < 0 || index > 15) {
    return;
  }
  
  vizState.colormapIndex = index;
  
  // Update the colormap name for tracking
  const colormapNames: ColormapType[] = [
    'viridis', 'inferno', 'plasma', 'blackbody', 'kindlmann', 'moreland',
    'coolwarm', 'parula', 'turbo', 'hot', 'cool', 'summer',
    'spring', 'winter', 'bone', 'copper'
  ];
  vizState.colormapName = colormapNames[index];
  
  
  // Re-apply the current scalar source with new colormap
  _rebuildVisualization();
}

/**
 * Set colormap by name
 */
export function setColormapByName(name: ColormapType): void {
  const colormapIndices: Record<ColormapType, number> = {
    'viridis': 0, 'inferno': 1, 'plasma': 2, 'blackbody': 3,
    'kindlmann': 4, 'moreland': 5, 'coolwarm': 6, 'parula': 7,
    'turbo': 8, 'hot': 9, 'cool': 10, 'summer': 11,
    'spring': 12, 'winter': 13, 'bone': 14, 'copper': 15
  };
  
  const index = colormapIndices[name];
  if (index === undefined) {
    return;
  }
  
  vizState.colormapIndex = index;
  vizState.colormapName = name;
  
  
  // Re-apply the current scalar source with new colormap
  _rebuildVisualization();
}

/**
 * Set color range (min/max values for normalization)
 */
export function setColorRange(min: number, max: number): void {
  if (min >= max) {
    return;
  }
  
  vizState.minValue = min;
  vizState.maxValue = max;
  
  
  // Re-apply the current scalar source with new range
  _rebuildVisualization();
}

/**
 * Set scalar source from a buffer
 */
export function setScalarSource(
  source: 'none' | 'fieldBuffer' | 'eigenmode' | 'fractalNoise',
  bufferKey?: string
): void {
  vizState.scalarSource = source;
  vizState.bufferKey = bufferKey || null;
  
  
  _rebuildVisualization();
}

/**
 * Set active field for visualization
 * Generic method that works with any ScalarField (buffer or procedural)
 */
export function setActiveField(
  field: ScalarField,
  opts?: { 
    colormapIndex?: number;
    colormapName?: ColormapType;
    min?: number;
    max?: number;
  }
): void {
  if (!mesh || !material) {
    return;
  }

  if (!(material instanceof THREE.MeshStandardNodeMaterial)) {
    return;
  }

  // Get colormap atlas texture (preloaded during init)
  const atlasTex = getColormapAtlasTexture();
  if (!atlasTex) {
    return;
  }

  // Use provided range or field's default
  const min = opts?.min ?? field.defaultRange.min;
  const max = opts?.max ?? field.defaultRange.max;
  
  // Use provided colormap or current state
  let colormapIdx: number;
  if (opts?.colormapName) {
    colormapIdx = getColormapIndex(opts.colormapName);
    vizState.colormapName = opts.colormapName;
  } else if (opts?.colormapIndex !== undefined) {
    colormapIdx = opts.colormapIndex;
  } else {
    colormapIdx = vizState.colormapIndex;
  }

  // Build TSL nodes
  const atlasNode = texture(atlasTex);

  // Build scalar node from field
  const scalarNode = field.buildScalarNode({
    positionNode: positionLocal,
    timeNode: customTime,
  });

  // Build colormap node
  const rgb = FloatToColormap(
    scalarNode,
    float(min),
    float(max),
    atlasNode,
    float(colormapIdx),
    float(16) // 16 colormaps in atlas
  );

  // Update material
  material.colorNode = rgb;
  material.roughnessNode = float(0.8);
  material.metalnessNode = float(0.0);
  material.needsUpdate = true;

  // Update state
  vizState.scalarSource = 'fractalNoise'; // Generic procedural indicator
  vizState.colormapIndex = colormapIdx;
  vizState.minValue = min;
  vizState.maxValue = max;
  
  // Store the active field for rebuilding
  activeField = field;

}

/**
 * Internal: rebuild visualization based on current state
 * This updates material.colorNode without recreating the mesh
 */
function _rebuildVisualization(): void {
  if (!mesh || !material) {
    return;
  }
  
  // Case 1: No visualization active
  if (vizState.scalarSource === 'none') {
    material.colorNode = null;
    material.color.setHex(0xe6f7f7);
    activeField = null;
    return;
  }
  
  // Case 2: Fractal noise or procedural field
  if (vizState.scalarSource === 'fractalNoise' && activeField) {
    const atlasTex = getColormapAtlasTexture();
    if (!atlasTex) {
      return;
    }
    
    // Rebuild the colormap node with current colormap index
    const atlasNode = texture(atlasTex);
    const scalarNode = activeField.buildScalarNode({
      positionNode: positionLocal,
      timeNode: customTime,
    });
    
    const rgb = FloatToColormap(
      scalarNode,
      float(vizState.minValue),
      float(vizState.maxValue),
      atlasNode,
      float(vizState.colormapIndex),
      float(16)
    );
    
    material.colorNode = rgb;
    material.needsUpdate = true;
    
    return;
  }
  
  // Case 3: Other sources (buffer, eigenmode) - to be implemented
  // TODO: Implement other scalar source nodes
  // const atlasNode = texture(atlasTex);
  // const scalarNode = _getScalarNode(vizState.scalarSource, vizState.bufferKey);
  // const colorNode = FloatToColormap(
  //   scalarNode,
  //   vizState.minValue,
  //   vizState.maxValue,
  //   atlasNode,
  //   vizState.colormapIndex,
  //   16
  // );
  // material.colorNode = colorNode;
}

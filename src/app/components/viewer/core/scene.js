/**
 * scene.js
 * 
 * Factory functions for scene creation and root node registration.
 * 
 * Creates the THREE.Scene and registers stable root nodes for organizing
 * content by purpose (world content with frame transforms, overlays, debug helpers).
 */

import * as THREE from 'three';
import { createMATLABFrame, createThreeJSFrame } from './frameTransform.js';

/**
 * Create scene with configuration and root nodes
 * @param {Object} config - Scene configuration
 * @param {number | string} [config.backgroundColor=0x000000] - Background color
 * @returns {Object} Object containing scene and named root nodes
 * @returns {THREE.Scene} returns.scene - The scene
 * @returns {Object} returns.roots - Named root node groups
 * @returns {THREE.Group} returns.roots.matlab - Root for MATLAB-coordinate geometry (Z-up → Y-up transform applied)
 * @returns {THREE.Group} returns.roots.threejs - Root for three.js native geometry (identity transform, for .glb files)
 * @returns {THREE.Group} returns.roots.overlay - Root for UI/helpers that don't inherit world transforms
 * @returns {THREE.Group} returns.roots.debug - Root for debug visualizations (axes, bounds, etc.)
 */
export function createScene(config = {}) {
  const {
    backgroundColor = 0x000000
  } = config;

  // Create scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(backgroundColor);

  // Create MATLAB frame root (handles Z-up → Y-up conversion for raw JSON data)
  const matlabFrame = createMATLABFrame();
  scene.add(matlabFrame);

  // Create three.js frame root (identity transform for .glb files that are already Y-up)
  const threejsFrame = createThreeJSFrame();
  scene.add(threejsFrame);

  // Create overlay root (identity transform, for UI elements)
  const overlayRoot = new THREE.Group();
  overlayRoot.name = 'overlayRoot';
  scene.add(overlayRoot);

  // Create debug root (identity transform, for axes/helpers)
  const debugRoot = new THREE.Group();
  debugRoot.name = 'debugRoot';
  scene.add(debugRoot);

  // Store references in scene.userData for easy access
  // IMPORTANT: 
  // - Raw JSON geometry should be added to matlabFrame (needs Z-up → Y-up transform)
  // - GLB files should be added to threejsFrame (already Y-up from export)
  scene.userData.matlabFrame = matlabFrame;
  scene.userData.threejsFrame = threejsFrame;
  scene.userData.overlayRoot = overlayRoot;
  scene.userData.debugRoot = debugRoot;

  return {
    scene,
    roots: {
      matlab: matlabFrame,
      threejs: threejsFrame,
      overlay: overlayRoot,
      debug: debugRoot
    }
  };
}



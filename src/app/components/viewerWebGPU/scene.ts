/**
 * scene.ts
 * 
 * WebGPU scene factory - creates Three.js scene with root node structure
 * Simplified version without MATLAB frame transforms (BCT data is native Y-up)
 */

import * as THREE from 'three/webgpu';

export interface SceneRoots {
  world: THREE.Group;
  overlay: THREE.Group;
  debug: THREE.Group;
}

export interface SceneResult {
  scene: THREE.Scene;
  roots: SceneRoots;
}

/**
 * Create scene with root node hierarchy
 */
export function createScene(config: { backgroundColor?: number } = {}): SceneResult {
  const { backgroundColor = 0x000000 } = config;

  // Create scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(backgroundColor);

  // Create world root (for mesh geometry)
  const worldRoot = new THREE.Group();
  worldRoot.name = 'worldRoot';
  
  // Apply RAS→Three.js coordinate transform
  // fsaverage data is in RAS coordinates (X=Right, Y=Anterior, Z=Superior)
  // Three.js convention is Y-up, so we map:
  //   X_three =  X_ras (right stays right)
  //   Y_three =  Z_ras (superior becomes up)
  //   Z_three = -Y_ras (anterior becomes -forward, keeps right-handed)
  // Matrix4.set() takes row-major order
  const rasToThreeJS = new THREE.Matrix4().set(
    1,  0,  0,  0,
    0,  0,  1,  0,
    0, -1,  0,  0,
    0,  0,  0,  1
  );
  
  // Reset transforms before applying (safety)
  worldRoot.position.set(0, 0, 0);
  worldRoot.rotation.set(0, 0, 0);
  worldRoot.scale.set(1, 1, 1);
  worldRoot.updateMatrix();
  
  worldRoot.applyMatrix4(rasToThreeJS);
  worldRoot.updateMatrixWorld(true);
  
  scene.add(worldRoot);

  // Create overlay root (for UI elements)
  const overlayRoot = new THREE.Group();
  overlayRoot.name = 'overlayRoot';
  scene.add(overlayRoot);

  // Create debug root (for axes/helpers)
  const debugRoot = new THREE.Group();
  debugRoot.name = 'debugRoot';
  scene.add(debugRoot);

  return {
    scene,
    roots: {
      world: worldRoot,
      overlay: overlayRoot,
      debug: debugRoot
    }
  };
}

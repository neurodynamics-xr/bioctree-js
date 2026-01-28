/**
 * lighting.ts
 * 
 * Camera-locked lighting rig for WebGPU viewer.
 * Reuses logic from viewer/core/lighting.js with TypeScript types.
 */

import * as THREE from 'three/webgpu';

/**
 * Create a view-locked lighting rig attached to the camera.
 * The rig moves with the camera to provide consistent illumination.
 */
export function createLightingRig(camera: THREE.Camera): THREE.Group {
  const lightRig = new THREE.Group();
  camera.add(lightRig);

  // Ambient light
  const ambient = new THREE.AmbientLight(0xffffff, 0.2);
  lightRig.add(ambient);

  // Key light (front-right in view space)
  const key = new THREE.DirectionalLight(0xffffff, 1.45);
  key.position.set(1.0, 0.8, 1.2);
  lightRig.add(key);

  key.target.position.set(0, 0, 0);
  lightRig.add(key.target);

  // Fill light (front-left in view space)
  const fill = new THREE.DirectionalLight(0xffffff, 0.95);
  fill.position.set(-1.0, 0.4, 1.0);
  lightRig.add(fill);

  fill.target.position.set(0, 0, 0);
  lightRig.add(fill.target);

  // Rim light (back in view space)
  const rim = new THREE.DirectionalLight(0xffffff, 0.45);
  rim.position.set(0, 0.2, -1.0);
  lightRig.add(rim);

  rim.target.position.set(0, 0, 0);
  lightRig.add(rim.target);

  return lightRig;
}

/**
 * Remove and dispose of a lighting rig
 */
export function disposeLightingRig(lightRig: THREE.Group): void {
  if (!lightRig) return;

  if (lightRig.parent) {
    lightRig.parent.remove(lightRig);
  }

  lightRig.traverse((obj) => {
    if ('dispose' in obj && typeof obj.dispose === 'function') {
      obj.dispose();
    }
  });
}

/**
 * lighting.js
 * 
 * View-locked lighting rig for consistent illumination.
 * 
 * Responsibilities:
 * - Create and manage lighting rig
 * - Attach lights to camera for view-locked behavior
 * - No geometry or material knowledge
 * 
 * Rules:
 * - Lighting is view-relative, not data-relative
 * - All lights attached to camera for consistent illumination
 */

import * as THREE from 'three';

/**
 * Create a view-locked lighting rig attached to the camera.
 * The rig moves with the camera to provide consistent illumination
 * regardless of mesh orientation.
 * 
 * @param {THREE.Camera} camera - Camera to attach lights to
 * @returns {THREE.Group} Lighting rig group
 */
export function createLightingRig(camera) {
  const lightRig = new THREE.Group();
  
  // Attach to camera so illumination is consistent across mesh rotations
  camera.add(lightRig);

  // Base ambient light: keep low to preserve contrast
  const ambient = new THREE.AmbientLight(0xffffff, 0.2);
  lightRig.add(ambient);

  // Key light (front-right in view space)
  const key = new THREE.DirectionalLight(0xffffff, 1.45);
  key.position.set(1.0, 0.8, 1.2);
  lightRig.add(key);

  // DirectionalLight uses a target to define direction
  // Parent target to rig for view-lock
  key.target.position.set(0, 0, 0);
  lightRig.add(key.target);

  // Fill light (front-left in view space)
  const fill = new THREE.DirectionalLight(0xffffff, 0.95);
  fill.position.set(-1.0, 0.4, 1.0);
  lightRig.add(fill);

  fill.target.position.set(0, 0, 0);
  lightRig.add(fill.target);

  // Rim light (back in view space) - subtle edge definition
  const rim = new THREE.DirectionalLight(0xffffff, 0.45);
  rim.position.set(0, 0.2, -1.0);
  lightRig.add(rim);

  rim.target.position.set(0, 0, 0);
  lightRig.add(rim.target);
  
  return lightRig;
}

/**
 * Remove and dispose of a lighting rig
 * 
 * @param {THREE.Group} lightRig - Lighting rig to dispose
 */
export function disposeLightingRig(lightRig) {
  if (!lightRig) return;
  
  if (lightRig.parent) {
    lightRig.parent.remove(lightRig);
  }
  
  // Dispose of all lights in the rig
  lightRig.traverse((obj) => {
    if (obj.dispose) {
      obj.dispose();
    }
  });
}

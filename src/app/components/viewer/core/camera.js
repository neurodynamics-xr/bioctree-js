/**
 * camera.js
 * 
 * Factory functions for camera creation and configuration.
 * 
 * Centralizes camera construction and handles aspect ratio updates.
 * Supports both perspective and orthographic cameras (future).
 */

import * as THREE from 'three';

/**
 * Create camera with configuration
 * @param {Object} config - Camera configuration
 * @param {string} [config.type='perspective'] - Camera type ('perspective' | 'orthographic')
 * @param {number} [config.fov=45] - Field of view (perspective only)
 * @param {number} [config.near=0.01] - Near clipping plane
 * @param {number} [config.far=1e7] - Far clipping plane
 * @param {Array<number>} [config.position=[0, 0, 300]] - Initial position [x, y, z]
 * @param {Array<number>} [config.up=[0, 1, 0]] - Up vector [x, y, z]
 * @param {number} aspect - Aspect ratio (width / height)
 * @returns {THREE.PerspectiveCamera | THREE.OrthographicCamera} Configured camera
 */
export function createCamera(config, aspect) {
  const {
    type = 'perspective',
    fov = 45,
    near = 0.01,
    far = 1e7,
    position = [0, 0, 300],
    up = [0, 1, 0]
  } = config;

  let camera;

  if (type === 'perspective') {
    camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  } else if (type === 'orthographic') {
    // For orthographic, aspect determines frustum width/height ratio
    const frustumHeight = 200; // Default, can be parameterized
    const frustumWidth = frustumHeight * aspect;
    camera = new THREE.OrthographicCamera(
      -frustumWidth / 2, frustumWidth / 2,
      frustumHeight / 2, -frustumHeight / 2,
      near, far
    );
  } else {
    throw new Error(`Unknown camera type: ${type}`);
  }

  // Set up vector and position
  camera.up.set(...up);
  camera.position.set(...position);

  return camera;
}

/**
 * Update camera aspect ratio and projection matrix
 * @param {THREE.Camera} camera - Camera to resize
 * @param {number} aspect - New aspect ratio (width / height)
 */
export function resizeCamera(camera, aspect) {
  if (camera.isPerspectiveCamera) {
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  } else if (camera.isOrthographicCamera) {
    // For orthographic, adjust frustum based on aspect
    const frustumHeight = camera.top - camera.bottom;
    const frustumWidth = frustumHeight * aspect;
    camera.left = -frustumWidth / 2;
    camera.right = frustumWidth / 2;
    camera.updateProjectionMatrix();
  }
}

/**
 * Frame camera to fit mesh bounds
 * Automatically positions camera to view entire mesh with comfortable padding
 * @param {THREE.Camera} camera - Camera to position
 * @param {THREE.OrbitControls} controls - Orbit controls
 * @param {Object} bounds - Mesh bounds from meshManager.getBounds()
 * @param {THREE.Vector3} bounds.center - Mesh center
 * @param {number} bounds.radius - Bounding sphere radius
 * @param {number} [padding=1.5] - Padding factor (1.5 = 50% extra space)
 */
export function frameCameraToBounds(camera, controls, bounds, padding = 1.5) {
  if (!bounds || !bounds.center || bounds.radius === undefined) {
    console.warn('[camera] Invalid bounds for framing:', bounds);
    return;
  }

  const { center, radius } = bounds;
  
  // Set orbit target to mesh center
  controls.target.copy(center);
  
  // Calculate camera distance based on FOV and bounding sphere
  let distance;
  
  if (camera.isPerspectiveCamera) {
    // For perspective camera, calculate distance to fit sphere in view
    // Math: distance = radius / tan(fov/2)
    const fov = camera.fov * (Math.PI / 180); // Convert to radians
    const halfFov = fov / 2;
    distance = (radius * padding) / Math.tan(halfFov);
  } else if (camera.isOrthographicCamera) {
    // For orthographic, just move back by radius
    distance = radius * padding;
  } else {
    distance = radius * padding;
  }
  
  // Position camera at calculated distance along current view direction
  // Preserve current camera angle relative to target
  const direction = new THREE.Vector3()
    .subVectors(camera.position, controls.target)
    .normalize();
  
  // If camera is too close to target (first load), use default direction
  if (direction.length() < 0.1) {
    direction.set(0, 0, 1); // Default: look from +Z
  }
  
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.lookAt(center);
  controls.update();
  
  console.log('[camera] Framed to bounds:', {
    center: center.toArray(),
    radius: radius.toFixed(2),
    distance: distance.toFixed(2),
    cameraPos: camera.position.toArray().map(v => v.toFixed(2))
  });
}

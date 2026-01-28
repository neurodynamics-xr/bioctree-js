/**
 * camera.ts
 * 
 * Camera factory for WebGPU viewer.
 * Reuses logic from viewer/core/camera.js with TypeScript types.
 */

import * as THREE from 'three/webgpu';

export interface CameraConfig {
  type?: 'perspective' | 'orthographic';
  fov?: number;
  near?: number;
  far?: number;
  position?: [number, number, number];
  up?: [number, number, number];
}

/**
 * Create camera with configuration
 */
export function createCamera(config: CameraConfig, aspect: number): THREE.PerspectiveCamera | THREE.OrthographicCamera {
  const {
    type = 'perspective',
    fov = 45,
    near = 0.01,
    far = 1e7,
    position = [0, 0, 300],
    up = [0, 1, 0]
  } = config;

  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;

  if (type === 'perspective') {
    camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  } else if (type === 'orthographic') {
    const frustumHeight = 200;
    const frustumWidth = frustumHeight * aspect;
    camera = new THREE.OrthographicCamera(
      -frustumWidth / 2, frustumWidth / 2,
      frustumHeight / 2, -frustumHeight / 2,
      near, far
    );
  } else {
    throw new Error(`Unknown camera type: ${type}`);
  }

  camera.up.set(...up);
  camera.position.set(...position);

  return camera;
}

/**
 * Update camera aspect ratio and projection matrix
 */
export function resizeCamera(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, aspect: number): void {
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  } else if (camera instanceof THREE.OrthographicCamera) {
    const frustumHeight = camera.top - camera.bottom;
    const frustumWidth = frustumHeight * aspect;
    camera.left = -frustumWidth / 2;
    camera.right = frustumWidth / 2;
    camera.updateProjectionMatrix();
  }
}

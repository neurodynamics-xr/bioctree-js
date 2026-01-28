/**
 * renderer.js
 * 
 * Factory functions for WebGPU renderer creation and configuration.
 * 
 * Centralizes renderer construction and output pipeline defaults.
 * This is the single place to define tone mapping, color space,
 * and rendering policies.
 * 
 * NOTE: Migrated from WebGLRenderer to WebGPURenderer for zero-copy
 * GPU buffer sharing with WebGPU compute shaders.
 */

import * as THREE from 'three';
import * as WebGPU from 'three/webgpu';

/**
 * Create and configure WebGPU renderer
 * @param {Object} config - Renderer configuration
 * @param {HTMLCanvasElement} config.canvas - Canvas element
 * @param {boolean} [config.antialias=true] - Enable antialiasing (MSAA)
 * @param {number} [config.pixelRatio] - Device pixel ratio (defaults to window.devicePixelRatio)
 * @param {number} [config.toneMapping=THREE.ACESFilmicToneMapping] - Tone mapping mode
 * @param {number} [config.toneMappingExposure=1.0] - Tone mapping exposure
 * @param {string} [config.outputColorSpace=THREE.SRGBColorSpace] - Output color space
 * @returns {Promise<WebGPU.WebGPURenderer>} Configured renderer (async init required)
 */
export async function createRenderer(config) {
  const {
    canvas,
    antialias = true,
    pixelRatio = window.devicePixelRatio ?? 1,
    toneMapping = THREE.ACESFilmicToneMapping,
    toneMappingExposure = 1.0,
    outputColorSpace = THREE.SRGBColorSpace
  } = config;

  // Check WebGPU support
  if (!navigator.gpu) {
    throw new Error('WebGPU not supported in this browser. Please use Chrome 113+ or Edge 113+');
  }

  const renderer = new WebGPU.WebGPURenderer({ 
    canvas,
    antialias,
    forceWebGL: false // Explicitly request WebGPU backend
  });

  // WebGPU requires async initialization
  await renderer.init();

  renderer.setPixelRatio(pixelRatio);

  // Conservative tone mapping and color space
  if ('outputColorSpace' in renderer) {
    renderer.outputColorSpace = outputColorSpace;
  }
  renderer.toneMapping = toneMapping;
  renderer.toneMappingExposure = toneMappingExposure;

  console.log('[Renderer] WebGPU renderer initialized');

  return renderer;
}

/**
 * Resize renderer to match container dimensions
 * @param {WebGPU.WebGPURenderer} renderer - Renderer to resize
 * @param {number} width - New width
 * @param {number} height - New height
 */
export function resizeRenderer(renderer, width, height) {
  renderer.setSize(width, height, false);
}

/**
 * Get WebGPU device from renderer for buffer sharing
 * @param {WebGPU.WebGPURenderer} renderer - WebGPU renderer
 * @returns {GPUDevice} WebGPU device instance
 */
export function getGPUDevice(renderer) {
  const backend = renderer.backend;
  if (!backend || !backend.device) {
    throw new Error('WebGPU backend not initialized');
  }
  return backend.device;
}

/**
 * viewerCore.js
 * 
 * Core three.js rendering runtime: orchestration and lifecycle management.
 * 
 * Responsibilities:
 * - Orchestrate scene, camera, renderer creation via factory functions
 * - Manage render loop (animation loop)
 * - Handle resize events
 * - Manage camera controls (OrbitControls)
 * - Provide callback registration for render/controls events
 * 
 * Rules:
 * - No awareness of geometry or picking
 * - No material creation
 * - No detailed construction logic (delegates to factory modules)
 * - Pure orchestration and lifecycle management
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createScene } from './scene.js';
import { createCamera, resizeCamera } from './camera.js';
import { createRenderer, resizeRenderer } from './renderer.js';

/**
 * ViewerCore - Core three.js rendering system orchestrator
 */
export class ViewerCore {
  constructor(canvas) {
    this.canvas = canvas;
    
    // Core three.js objects
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    
    // Scene root nodes (populated by createScene)
    this.roots = null;
    
    // Animation loop state
    this.isRunning = false;
    this.renderCallbacks = [];
    this.controlsChangeCallbacks = [];
  }

  /**
   * Initialize the core rendering system
   * @param {Object} options - Configuration options
   * @param {number} [options.backgroundColor=0x000000] - Background color
   * @param {Object} [options.cameraConfig] - Camera configuration
   * @param {Object} [options.controlsConfig] - Controls configuration
   * @param {Object} [options.rendererConfig] - Renderer configuration
   * @returns {Promise<void>} Resolves when initialization is complete
   */
  async init(options = {}) {
    const {
      backgroundColor = 0x000000,
      cameraConfig = {},
      controlsConfig = {},
      rendererConfig = {}
    } = options;

    // Create scene with root nodes (via factory)
    const sceneResult = createScene({ backgroundColor });
    this.scene = sceneResult.scene;
    this.roots = sceneResult.roots;

    // Create camera (via factory)
    // Initial aspect ratio of 1, will be updated by resize
    this.camera = createCamera(cameraConfig, 1);

    // IMPORTANT: Add camera to scene for view-locked lighting
    this.scene.add(this.camera);

    // Create renderer (via factory) - WebGPU requires async initialization
    this.renderer = await createRenderer({
      canvas: this.canvas,
      ...rendererConfig
    });

    // Create orbit controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    
    const {
      enableDamping = true,
      dampingFactor = 0.08,
      target = [0, 0, 0],
      cameraPosition = [-300, 0, 0]
    } = controlsConfig;

    this.controls.enableDamping = enableDamping;
    this.controls.dampingFactor = dampingFactor;
    this.controls.target.set(...target);
    
    // Set camera position and look at target
    this.camera.position.set(...cameraPosition);
    this.camera.lookAt(this.controls.target);
    this.controls.update();

    // Wire up controls change event
    this.controls.addEventListener('change', () => {
      this.controlsChangeCallbacks.forEach(cb => cb());
    });
  }

  /**
   * Start the render loop
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.renderer.setAnimationLoop(() => this._renderFrame());
  }

  /**
   * Stop the render loop
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this.renderer.setAnimationLoop(null);
  }

  /**
   * Internal render frame method
   * @private
   */
  _renderFrame() {
    // Update controls
    this.controls.update();

    // Execute all registered callbacks
    this.renderCallbacks.forEach(cb => cb());

    // Main render
    this.renderer.setViewport(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.setScissorTest(false);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Register a callback to be executed each frame
   * @param {Function} callback - Function to call each frame
   */
  onRender(callback) {
    if (typeof callback === 'function') {
      this.renderCallbacks.push(callback);
    }
  }

  /**
   * Register a callback for controls change events
   * @param {Function} callback - Function to call when controls change
   */
  onControlsChange(callback) {
    if (typeof callback === 'function') {
      this.controlsChangeCallbacks.push(callback);
    }
  }

  /**
   * Handle canvas resize
   */
  resize() {
    const w = this.canvas?.clientWidth ?? 0;
    const h = this.canvas?.clientHeight ?? 0;
    if (!w || !h) return;

    // Update camera aspect ratio (via helper)
    const aspect = w / h;
    resizeCamera(this.camera, aspect);

    // Update renderer size (via helper)
    resizeRenderer(this.renderer, w, h);
  }

  /**
   * Setup automatic resize observation
   */
  setupResizeObserver() {
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.canvas);
    
    // Initial resize
    this.resize();
  }

  /**
   * Get the renderer's DOM element for event listeners
   */
  getRendererElement() {
    return this.renderer?.domElement;
  }

  /**
   * Dispose of all resources
   */
  dispose() {
    this.stop();
    
    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }
    
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    
    this.renderCallbacks = [];
    this.controlsChangeCallbacks = [];
  }
}

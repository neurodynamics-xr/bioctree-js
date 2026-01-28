/**
 * @file geodesicDistanceService.js
 * Geodesic distance computation service using geometry-processing-js HeatMethod
 * 
 * Responsibilities:
 * - Initialize HeatMethod from Three.js mesh
 * - Compute geodesic distances from vertex selections
 * - Manage multiple source vertices
 * - Convert results to visualization-ready formats
 */

import { buildProcessingMesh, indexElements, scalarFieldToColors } from './geometryProcessingBridge.js';

/**
 * GeodesicDistanceService - Wraps geometry-processing-js HeatMethod
 */
export class GeodesicDistanceService {
  constructor() {
    this.mesh = null;
    this.geometry = null;
    this.heatMethod = null;
    this.vertexIndex = null;
    this.delta = null; // Source vertex indicator (DenseMatrix)
    this.memoryManager = null;
    this.sourceVertices = new Set(); // Track selected source vertices
    this.lastResult = null; // Cache last computed distances
  }

  /**
   * Initialize from Three.js geometry
   * @param {THREE.BufferGeometry} threeGeometry - Mesh to compute geodesics on
   * @returns {boolean} Success status
   */
  initialize(threeGeometry) {
    console.log('[GeodesicService] Initializing from Three.js geometry...');

    // Check library availability
    if (typeof HeatMethod === 'undefined') {
      console.error('[GeodesicService] HeatMethod class not loaded from geometry-processing-js');
      return false;
    }

    // CRITICAL: Check memoryManager is initialized
    if (typeof memoryManager === 'undefined') {
      console.error('[GeodesicService] Global memoryManager not initialized!');
      console.error('[GeodesicService] Add this to index.html after script tags:');
      console.error('  <script>var memoryManager = new EmscriptenMemoryManager();</script>');
      return false;
    }

    // Convert Three.js geometry to processing mesh
    const result = buildProcessingMesh(threeGeometry);
    if (!result) {
      console.error('[GeodesicService] Failed to build processing mesh');
      return false;
    }

    this.mesh = result.mesh;
    this.geometry = result.geometry;

    // Build vertex index
    this.vertexIndex = indexElements(this.mesh.vertices);

    // Initialize HeatMethod
    try {
      this.heatMethod = new HeatMethod(this.geometry);
      console.log('[GeodesicService] HeatMethod initialized successfully');
    } catch (error) {
      console.error('[GeodesicService] Failed to initialize HeatMethod:', error);
      return false;
    }

    // Initialize memory manager
    if (typeof EmscriptenMemoryManager !== 'undefined') {
      this.memoryManager = new EmscriptenMemoryManager();
    }

    // Initialize delta (source indicator) to zeros
    const nVertices = this.mesh.vertices.length;
    this.delta = DenseMatrix.zeros(nVertices, 1);

    console.log(`[GeodesicService] Ready - ${nVertices} vertices`);
    return true;
  }

  /**
   * Add source vertex for geodesic computation
   * @param {number} vertexIndex - Index of source vertex
   * @returns {boolean} Whether computation should be triggered
   */
  addSourceVertex(vertexIndex) {
    if (vertexIndex < 0 || vertexIndex >= this.mesh.vertices.length) {
      console.error('[GeodesicService] Invalid vertex index:', vertexIndex);
      return false;
    }

    if (this.sourceVertices.has(vertexIndex)) {
      console.log('[GeodesicService] Vertex already selected:', vertexIndex);
      return false;
    }

    this.sourceVertices.add(vertexIndex);
    this.delta.set(1, vertexIndex, 0);
    console.log(`[GeodesicService] Added source vertex ${vertexIndex} (${this.sourceVertices.size} total)`);
    return true;
  }

  /**
   * Remove source vertex
   * @param {number} vertexIndex - Index of source vertex to remove
   * @returns {boolean} Whether computation should be triggered
   */
  removeSourceVertex(vertexIndex) {
    if (!this.sourceVertices.has(vertexIndex)) {
      return false;
    }

    this.sourceVertices.delete(vertexIndex);
    this.delta.set(0, vertexIndex, 0);
    console.log(`[GeodesicService] Removed source vertex ${vertexIndex} (${this.sourceVertices.size} remaining)`);
    return true;
  }

  /**
   * Clear all source vertices
   */
  clearSources() {
    console.log('[GeodesicService] Clearing all source vertices');
    this.sourceVertices.clear();

    // Reset delta to zeros
    const nVertices = this.mesh.vertices.length;
    for (let i = 0; i < nVertices; i++) {
      this.delta.set(0, i, 0);
    }

    this.lastResult = null;
  }

  /**
   * Compute geodesic distances from current source vertices
   * @returns {Object|null} {distances: DenseMatrix, range: [min, max]} or null if no sources
   */
  compute() {
    if (this.sourceVertices.size === 0) {
      console.log('[GeodesicService] No source vertices - skipping computation');
      this.lastResult = null;
      return null;
    }

    console.log(`[GeodesicService] Computing geodesic distances from ${this.sourceVertices.size} sources...`);

    try {
      // Run heat method
      const phi = this.heatMethod.compute(this.delta);

      // Find min/max
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < phi.nRows(); i++) {
        const val = phi.get(i, 0);
        min = Math.min(min, val);
        max = Math.max(max, val);
      }

      console.log(`[GeodesicService] Computed distances - range: [${min.toFixed(6)}, ${max.toFixed(6)}]`);

      this.lastResult = { distances: phi, range: [min, max] };

      // Clean up intermediate memory (keep delta and operators)
      if (this.memoryManager) {
        this.memoryManager.deleteExcept([this.delta, this.heatMethod.A, this.heatMethod.F]);
      }

      return this.lastResult;
    } catch (error) {
      console.error('[GeodesicService] Computation failed:', error);
      return null;
    }
  }

  /**
   * Get vertex colors from geodesic distances
   * @param {Function} colormapFn - Colormap function
   * @param {Array} colormap - Colormap array
   * @returns {Float32Array|null} RGB colors (3 * nVertices) or null
   */
  getColors(colormapFn, colormap) {
    if (!this.lastResult) {
      return null;
    }

    return scalarFieldToColors(this.lastResult.distances, colormapFn, colormap);
  }

  /**
   * Get current state
   * @returns {Object}
   */
  getState() {
    return {
      initialized: this.heatMethod !== null,
      vertexCount: this.mesh ? this.mesh.vertices.length : 0,
      sourceCount: this.sourceVertices.size,
      sources: Array.from(this.sourceVertices),
      hasResult: this.lastResult !== null,
      range: this.lastResult ? this.lastResult.range : null
    };
  }

  /**
   * Dispose resources
   */
  dispose() {
    console.log('[GeodesicService] Disposing...');
    
    // Clean up memory manager
    if (this.memoryManager) {
      this.memoryManager.deleteExcept([]);
    }

    this.mesh = null;
    this.geometry = null;
    this.heatMethod = null;
    this.vertexIndex = null;
    this.delta = null;
    this.sourceVertices.clear();
    this.lastResult = null;
  }
}

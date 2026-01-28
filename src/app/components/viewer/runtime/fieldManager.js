/**
 * @file fieldManager.js
 * FieldManager - Owns scalar/vector field data lifecycle: load, apply, clear
 * Follows same pattern as MeshManager for consistency
 */

import { ScalarMapper } from '../visualization/scalarMapper.js';

/**
 * FieldManager - Manages scalar/vector field data
 * Emits events: 'fieldLoadStarted', 'fieldLoaded', 'fieldCleared', 'fieldFailed'
 */
export class FieldManager {
  /**
   * @param {Object} meshManager - MeshManager instance (for accessing mesh)
   * @param {Object} colorbar - Colorbar UI instance
   * @param {Object} vizState - Visualization state object (for colormap settings)
   */
  constructor(meshManager, colorbar, vizState) {
    this.meshManager = meshManager;
    this.colorbar = colorbar;
    this.vizState = vizState;
    this.vizGUI = null; // Will be set by render.js after GUI initialization
    
    // Current field data
    this.currentField = null; // { name, type, data, range, count }
    
    // Scalar visualization
    this.scalarMapper = new ScalarMapper();
    
    // Event listeners
    this.listeners = new Map(); // event -> Set of callbacks
  }
  
  /**
   * Set the vizGUI instance (called by render.js after GUI initialization)
   * @param {Object} gui - lil-gui instance
   */
  setVizGUI(gui) {
    this.vizGUI = gui;
  }

  /**
   * Subscribe to field lifecycle events
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    
    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(event);
      if (listeners) {
        listeners.delete(callback);
      }
    };
  }

  /**
   * Emit event to all listeners
   * @private
   */
  _emit(event, data) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }

  /**
   * Load scalar field data and apply to mesh
   * @param {Object} options - Field options
   * @param {string} options.name - Field name
   * @param {Float32Array} options.data - Scalar values (one per vertex)
   * @param {string} [options.colormap] - Colormap name (optional, uses vizState default)
   * @param {Array} [options.clim] - Color limits [min, max] (optional, auto-computed)
   */
  loadScalarField({ name, data, colormap, clim }) {
    // Emit load started event
    this._emit('fieldLoadStarted', { name, type: 'scalar' });

    try {
      // Validate data
      if (!data || data.length === 0) {
        throw new Error('No scalar data provided');
      }

      // Check mesh is loaded
      const loadedScene = this.meshManager.getLoadedScene();
      if (!loadedScene) {
        throw new Error('No mesh loaded. Load mesh before applying fields.');
      }

      // Auto-compute range if not provided and autoRange is enabled
      let range = clim;
      if (!range && this.vizState.scalar.autoRange) {
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < data.length; i++) {
          if (data[i] < min) min = data[i];
          if (data[i] > max) max = data[i];
        }
        range = [min, max];
      }

      // Use colormap from vizState if not provided
      const cmapName = colormap || this.vizState.scalar.colormap;

      // Validate vertex count matches data length
      let totalVertexCount = 0;
      loadedScene.traverse(obj => {
        if (obj.isMesh && obj.geometry) {
          const posAttr = obj.geometry.attributes.position;
          if (posAttr) {
            totalVertexCount += posAttr.count;
          }
        }
      });

      console.log(`[FieldManager] Mesh has ${totalVertexCount} vertices, scalar data has ${data.length} values`);
      
      if (totalVertexCount !== data.length) {
        console.warn(`[FieldManager] ⚠️ VERTEX COUNT MISMATCH: Mesh has ${totalVertexCount} vertices but scalar data has ${data.length} values`);
        throw new Error(`Vertex count mismatch: mesh has ${totalVertexCount} vertices, data has ${data.length} values`);
      }

      // Store field data
      this.currentField = {
        name,
        type: 'scalar',
        data,
        range,
        count: data.length
      };

      // Apply to all meshes in scene
      loadedScene.traverse(obj => {
        if (obj.isMesh) {
          console.log(`[FieldManager] Applying scalar to mesh with ${obj.geometry.attributes.position.count} vertices`);
          this.scalarMapper.applyToMesh(obj, data, { colormap: cmapName, clim: range });
        }
      });

      // Update colorbar
      if (this.colorbar && range) {
        this.colorbar.update(cmapName, range[0], range[1]);
        this.colorbar.setVisible(true);
        this.vizState.scalar.colorbar = true;
        // Update GUI to reflect colorbar state change
        if (this.vizGUI && typeof this.vizGUI.updateDisplay === 'function') {
          this.vizGUI.updateDisplay();
        }
      }

      // Emit field loaded event
      this._emit('fieldLoaded', {
        name,
        type: 'scalar',
        count: data.length,
        range
      });

      console.log(`[FieldManager] Loaded scalar field '${name}': ${data.length} values, range [${range[0]}, ${range[1]}]`);
    } catch (error) {
      this._emit('fieldFailed', { name, type: 'scalar', error: error.message });
      throw error;
    }
  }

  /**
   * Update colormap for current field (re-apply with new colormap)
   * @param {string} colormapName - New colormap name
   */
  updateColormap(colormapName) {
    if (!this.currentField || this.currentField.type !== 'scalar') {
      console.warn('[FieldManager] No scalar field loaded');
      return;
    }

    const loadedScene = this.meshManager.getLoadedScene();
    if (!loadedScene) {
      console.warn('[FieldManager] No mesh loaded');
      return;
    }

    // Re-apply with new colormap
    loadedScene.traverse(obj => {
      if (obj.isMesh) {
        this.scalarMapper.applyToMesh(obj, this.currentField.data, {
          colormap: colormapName,
          clim: this.currentField.range
        });
      }
    });

    // Update colorbar
    if (this.colorbar && this.currentField.range) {
      this.colorbar.update(colormapName, this.currentField.range[0], this.currentField.range[1]);
    }

    console.log(`[FieldManager] Updated colormap to '${colormapName}'`);
  }

  /**
   * Clear current field data
   */
  clearField() {
    if (!this.currentField) {
      return;
    }

    const loadedScene = this.meshManager.getLoadedScene();
    if (loadedScene) {
      loadedScene.traverse(obj => {
        if (obj.isMesh) {
          this.scalarMapper.clearFromMesh(obj);
        }
      });
    }

      // Update GUI to reflect colorbar state change
      if (this.vizGUI && typeof this.vizGUI.updateDisplay === 'function') {
        this.vizGUI.updateDisplay();
      }
    // Hide colorbar
    if (this.colorbar) {
      this.colorbar.setVisible(false);
      this.vizState.scalar.colorbar = false;
    }

    // Emit cleared event
    this._emit('fieldCleared', { name: this.currentField.name, type: this.currentField.type });

    this.currentField = null;

    console.log('[FieldManager] Cleared field data');
  }

  /**
   * Get current field metadata
   * @returns {Object|null} Field metadata or null
   */
  getCurrentField() {
    return this.currentField ? {
      name: this.currentField.name,
      type: this.currentField.type,
      count: this.currentField.count,
      range: this.currentField.range
    } : null;
  }

  /**
   * Check if field data is loaded
   * @returns {boolean}
   */
  hasField() {
    return this.currentField !== null;
  }
}

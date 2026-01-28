/**
 * @file visualizationManager.js
 * VisualizationManager - Owns visualization state application and helper visuals
 * Extracted from render.js as part of runtime refactor
 * 
 * NOTE: Geometry helpers (vertex normals, tangents) are currently placeholders.
 * They will be populated with data from MATLAB via future Viewer.m methods.
 * The renderer does NOT compute these attributes.
 */

import * as THREE from "three";
import { VertexNormalsHelper } from "three/addons/helpers/VertexNormalsHelper.js";
import { VertexTangentsHelper } from "three/addons/helpers/VertexTangentsHelper.js";
import { createDownsampledGeometry, createTransformedMesh } from '../geometry/meshBuilder.js';

/**
 * VisualizationManager - Manages visualization state application and helper visuals
 */
export class VisualizationManager {
  /**
   * @param {Object} viewerCore - ViewerCore instance
   * @param {Object} meshManager - MeshManager instance
   * @param {Object} lightRig - Light rig reference (optional)
   */
  constructor(viewerCore, meshManager, lightRig = null) {
    this.viewerCore = viewerCore;
    this.meshManager = meshManager;
    this.lightRig = lightRig;
    
    // Helper visuals owned by this manager
    this.normalsHelper = null;
    this.tangentsHelper = null;
  }

  /**
   * Apply visualization state to the loaded model
   * @param {Object} vizState - Visualization state object
   */
  applyState(vizState) {
    this.updateMaterial(vizState);
    this.updateHelpers(vizState);
  }

  /**
   * Called when model changes (load/clear) to rebuild helpers if needed
   */
  onModelChanged() {
    // Dispose any existing helpers
    this.disposeHelpers();
  }

  /**
   * Called on resize (if needed for helper materials)
   * @param {number} w - Width
   * @param {number} h - Height
   */
  onResize(w, h) {
    // Currently no resolution-dependent helpers
    // Add here if needed in future
  }

  /**
   * Dispose of helper visuals
   */
  dispose() {
    this.disposeHelpers();
  }

  /**
   * Update mesh material based on material dropdown
   * @private
   */
  updateMaterial(vizState) {
    const loadedScene = this.meshManager.getLoadedScene();
    if (!loadedScene) return;

    loadedScene.traverse((obj) => {
      if (!obj.isMesh) return;

      const baseMat = obj.userData.baseMaterial;
      const wireMat = obj.userData.wireMaterial;

      if (!baseMat || !wireMat) return;

      // Preserve vertex colors state from current material
      const hadVertexColors = obj.material?.vertexColors || false;
      const hadFlatShading = obj.material?.flatShading || false;

      // Switch material based on dropdown selection
      if (vizState.surface.material === 'wireframe') {
        obj.material = wireMat;
        wireMat.color.set(vizState.edges.color);
        // Preserve vertex colors state
        wireMat.vertexColors = hadVertexColors;
        wireMat.flatShading = hadFlatShading;
      } else {
        obj.material = baseMat;
        // Preserve vertex colors state
        baseMat.vertexColors = hadVertexColors;
        baseMat.flatShading = hadFlatShading;
      }
      
      obj.material.visible = true;
      obj.material.needsUpdate = true;
    });
  }

  /**
   * Update helper visuals (normals, tangents)
   * @private
   */
  updateHelpers(vizState) {
    const loadedScene = this.meshManager.getLoadedScene();
    
    // Update vertex normals
    if (vizState.helpers.vertexNormals) {
      this.syncNormalsVisibility(vizState);
    } else {
      if (this.normalsHelper) {
        // Remove from parent (could be in matlab or threejs root)
        if (this.normalsHelper.parent) {
          this.normalsHelper.parent.remove(this.normalsHelper);
        }
        this.normalsHelper = null;
      }
    }
    
    // Update tangents
    if (vizState.helpers.tangents) {
      this.syncTangentsVisibility(vizState);
    } else {
      if (this.tangentsHelper) {
        // Remove from parent (could be in matlab or threejs root)
        if (this.tangentsHelper.parent) {
          this.tangentsHelper.parent.remove(this.tangentsHelper);
        }
        this.tangentsHelper = null;
      }
    }
    
    // NOTE: Removed automatic mesh hiding/showing logic.
    // Surface visibility is controlled solely by vizState.surface.visible
    // via updateSurface() method. Helpers and surface are now independent.
  }



  /**
   * Sync normals helper visibility
   * @private
   */
  syncNormalsVisibility(vizState) {
    const loadedScene = this.meshManager.getLoadedScene();
    if (!loadedScene) return;

    // Remove existing helper if present
    if (this.normalsHelper) {
      // Remove from parent (could be in matlab or threejs root)
      if (this.normalsHelper.parent) {
        this.normalsHelper.parent.remove(this.normalsHelper);
      }
      this.normalsHelper = null;
    }

    // Determine which frame root the mesh is in
    const modelRoot = this.meshManager.modelRoot;
    let frameRoot = null;
    if (modelRoot && modelRoot.parent) {
      // Check if mesh is in matlab or threejs frame
      if (modelRoot.parent === this.viewerCore.roots.matlab) {
        frameRoot = this.viewerCore.roots.matlab;
      } else if (modelRoot.parent === this.viewerCore.roots.threejs) {
        frameRoot = this.viewerCore.roots.threejs;
      }
    }
    
    // Create vertex normals helpers for all meshes
    let meshCount = 0;
    
    loadedScene.traverse((obj) => {
      if (!obj.isMesh) return;
      meshCount++;

      const downsampleFactor = 1; // Testing: no downsampling (was 100)
      const geometry = obj.geometry;
      
      // Create downsampled geometry using meshBuilder
      const sparseGeometry = createDownsampledGeometry(geometry, downsampleFactor, false);
      if (!sparseGeometry) return;
      
      // Create temporary mesh with LOCAL transforms only (no parent frame transform)
      // The helper will inherit the frame transform from being added to frameRoot
      const tempMesh = new THREE.Mesh(sparseGeometry);
      tempMesh.position.copy(obj.position);
      tempMesh.rotation.copy(obj.rotation);
      tempMesh.scale.copy(obj.scale);
      
      // Create normals helper (red)
      const helper = new VertexNormalsHelper(tempMesh, 2, 0xff0000);
      
      if (!this.normalsHelper) {
        this.normalsHelper = new THREE.Group();
        // Add to the same frame root as the mesh (matlab or threejs)
        if (frameRoot) {
          frameRoot.add(this.normalsHelper);
        } else {
          // Fallback to scene if frame root not found
          this.viewerCore.scene.add(this.normalsHelper);
        }
      }
      
      this.normalsHelper.add(helper);
    });
  }

  /**
   * Sync tangents helper visibility
   * @private
   */
  syncTangentsVisibility(vizState) {
    const loadedScene = this.meshManager.getLoadedScene();
    if (!loadedScene) return;

    // Remove existing helper if present
    if (this.tangentsHelper) {
      // Remove from parent (could be in matlab or threejs root)
      if (this.tangentsHelper.parent) {
        this.tangentsHelper.parent.remove(this.tangentsHelper);
      }
      this.tangentsHelper = null;
    }

    // Determine which frame root the mesh is in
    const modelRoot = this.meshManager.modelRoot;
    let frameRoot = null;
    if (modelRoot && modelRoot.parent) {
      // Check if mesh is in matlab or threejs frame
      if (modelRoot.parent === this.viewerCore.roots.matlab) {
        frameRoot = this.viewerCore.roots.matlab;
      } else if (modelRoot.parent === this.viewerCore.roots.threejs) {
        frameRoot = this.viewerCore.roots.threejs;
      }
    }

    // Create vertex tangents helpers for all meshes
    let meshCount = 0;
    let tangentCount = 0;
    
    loadedScene.traverse((obj) => {
      if (!obj.isMesh) return;
      meshCount++;

      const downsampleFactor = 1; // Testing: no downsampling (was 100)
      const geometry = obj.geometry;
      const positions = geometry.attributes.position;
      const normals = geometry.attributes.normal;
      const tangents = geometry.attributes.tangent;
      const uvs = geometry.attributes.uv;
      
      if (!positions || !normals || !tangents) return;

      tangentCount++;

      // Create downsampled geometry with tangents using meshBuilder
      const sparseGeometry = createDownsampledGeometry(geometry, downsampleFactor, true);
      if (!sparseGeometry) return;
      
      // Create temporary mesh with LOCAL transforms only (no parent frame transform)
      // The helper will inherit the frame transform from being added to frameRoot
      const tempMesh = new THREE.Mesh(sparseGeometry);
      tempMesh.position.copy(obj.position);
      tempMesh.rotation.copy(obj.rotation);
      tempMesh.scale.copy(obj.scale);
      
      // Create tangents helper (cyan)
      const helper = new VertexTangentsHelper(tempMesh, 2, 0x00ffff);
      
      if (!this.tangentsHelper) {
        this.tangentsHelper = new THREE.Group();
        // Add to the same frame root as the mesh (matlab or threejs)
        if (frameRoot) {
          frameRoot.add(this.tangentsHelper);
        } else {
          // Fallback to scene if frame root not found
          this.viewerCore.scene.add(this.tangentsHelper);
        }
      }
      
      this.tangentsHelper.add(helper);
    });
  }

  /**
   * Dispose of all helper visuals
   * @private
   */
  disposeHelpers() {
    if (this.normalsHelper) {
      // Remove from parent (could be in matlab or threejs root)
      if (this.normalsHelper.parent) {
        this.normalsHelper.parent.remove(this.normalsHelper);
      }
      this.normalsHelper = null;
    }
    
    if (this.tangentsHelper) {
      // Remove from parent (could be in matlab or threejs root)
      if (this.tangentsHelper.parent) {
        this.tangentsHelper.parent.remove(this.tangentsHelper);
      }
      this.tangentsHelper = null;
    }
  }

  /**
   * Update normals helpers in render loop (if needed)
   */
  updateNormalsHelpers() {
    if (this.normalsHelper && this.normalsHelper.children) {
      this.normalsHelper.children.forEach(helper => {
        if (helper.update) helper.update();
      });
    }
  }

  /**
   * Update tangents helpers in render loop (if needed)
   */
  updateTangentsHelpers() {
    if (this.tangentsHelper && this.tangentsHelper.children) {
      this.tangentsHelper.children.forEach(helper => {
        if (helper.update) helper.update();
      });
    }
  }
}

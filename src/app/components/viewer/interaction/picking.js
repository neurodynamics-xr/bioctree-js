/**
 * @fileoverview Picking - Raycasting and hit classification
 * 
 * Handles all picking logic:
 * - Raycasting against meshes
 * - Hit classification (vertex/edge/triangle)
 * - Index resolution and distance calculations
 * 
 * No visual effects - pure computation + callbacks
 */

import * as THREE from "three";

/**
 * Picking system for mesh interaction
 */
export class PickingSystem {
  constructor(camera, renderer) {
    this.camera = camera;
    this.renderer = renderer;
    
    // Raycasting
    this.raycaster = new THREE.Raycaster();
    this.pointerNDC = new THREE.Vector2();
    
    // Pickable meshes
    this.pickables = [];
    
    // State
    this.enabled = true;
    this.mode = "triangle"; // "vertex" | "edge" | "triangle"
    
    // Callbacks
    this.onTrianglePick = null;
    this.onVertexPick = null;
    this.onEdgePick = null;
  }
  
  /**
   * Set picking mode
   * @param {string} mode - "vertex" | "edge" | "triangle"
   */
  setMode(mode) {
    if (["vertex", "edge", "triangle"].includes(mode)) {
      this.mode = mode;
    }
  }
  
  /**
   * Enable/disable picking
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = !!enabled;
  }
  
  /**
   * Collect pickable meshes from scene
   * @param {THREE.Object3D} root - Scene or model root
   */
  collectPickables(root) {
    this.pickables = [];
    if (!root) return;
    
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      
      // Recommended for cortex picking from inside/outside
      if (obj.material && obj.userData.baseMaterial) {
        obj.userData.baseMaterial.side = THREE.DoubleSide;
      }
      if (obj.material && obj.userData.wireMaterial) {
        obj.userData.wireMaterial.side = THREE.DoubleSide;
      }
      
      this.pickables.push(obj);
    });
  }
  
  /**
   * Handle pointer down event
   * @param {PointerEvent} evt
   */
  handlePointerDown(evt) {
    if (!this.enabled || this.pickables.length === 0) return;
    
    this._updatePointerNDC(evt);
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    
    const hits = this.raycaster.intersectObjects(this.pickables, true);
    if (!hits.length) return;
    
    const hit = hits[0];
    
    if (this.mode === "triangle") {
      this._pickTriangle(hit);
    } else if (this.mode === "vertex") {
      this._pickVertex(hit);
    } else if (this.mode === "edge") {
      this._pickEdge(hit);
    }
  }
  
  /**
   * Update pointer position in NDC coordinates
   * @private
   */
  _updatePointerNDC(evt) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((evt.clientY - rect.top) / rect.height) * 2 - 1);
    this.pointerNDC.set(x, y);
  }
  
  /**
   * Get triangle vertex indices
   * @private
   */
  _getTriVertexIndices(geom, faceIndex) {
    const base = faceIndex * 3;
    if (geom.index) {
      return {
        i0: geom.index.getX(base + 0),
        i1: geom.index.getX(base + 1),
        i2: geom.index.getX(base + 2)
      };
    }
    return { i0: base + 0, i1: base + 1, i2: base + 2 };
  }
  
  /**
   * Pick triangle
   * @private
   */
  _pickTriangle(hit) {
    const mesh = hit.object;
    const geom = mesh.geometry;
    if (!geom || hit.faceIndex == null) return;
    
    const tri = this._getTriVertexIndices(geom, hit.faceIndex);
    
    // Emit via callback
    if (this.onTrianglePick) {
      this.onTrianglePick(hit, tri);
    }
  }
  
  /**
   * Pick vertex (nearest to hit point)
   * @private
   */
  _pickVertex(hit) {
    const mesh = hit.object;
    const geom = mesh.geometry;
    if (!geom || hit.faceIndex == null) return;
    
    const tri = this._getTriVertexIndices(geom, hit.faceIndex);
    const pos = geom.attributes.position;
    
    const v0 = new THREE.Vector3().fromBufferAttribute(pos, tri.i0);
    const v1 = new THREE.Vector3().fromBufferAttribute(pos, tri.i1);
    const v2 = new THREE.Vector3().fromBufferAttribute(pos, tri.i2);
    
    // Compare in world space
    mesh.localToWorld(v0);
    mesh.localToWorld(v1);
    mesh.localToWorld(v2);
    
    const p = hit.point;
    const d0 = v0.distanceToSquared(p);
    const d1 = v1.distanceToSquared(p);
    const d2 = v2.distanceToSquared(p);
    
    let chosen = { idx: tri.i0, pt: v0, d: d0 };
    if (d1 < chosen.d) chosen = { idx: tri.i1, pt: v1, d: d1 };
    if (d2 < chosen.d) chosen = { idx: tri.i2, pt: v2, d: d2 };
    
    // Emit via callback
    if (this.onVertexPick) {
      this.onVertexPick(hit, chosen.idx, tri);
    }
  }
  
  /**
   * Pick edge (nearest to hit point)
   * @private
   */
  _pickEdge(hit) {
    const mesh = hit.object;
    const geom = mesh.geometry;
    if (!geom || hit.faceIndex == null) return;
    
    const tri = this._getTriVertexIndices(geom, hit.faceIndex);
    const pos = geom.attributes.position;
    
    // Get triangle vertices in world space
    const a = new THREE.Vector3().fromBufferAttribute(pos, tri.i0);
    const b = new THREE.Vector3().fromBufferAttribute(pos, tri.i1);
    const c = new THREE.Vector3().fromBufferAttribute(pos, tri.i2);
    
    mesh.localToWorld(a);
    mesh.localToWorld(b);
    mesh.localToWorld(c);
    
    const p = hit.point;
    
    const e01 = this._distPointToSegmentSq(p, a, b);
    const e12 = this._distPointToSegmentSq(p, b, c);
    const e20 = this._distPointToSegmentSq(p, c, a);
    
    let best = { edge: [tri.i0, tri.i1], d: e01 };
    if (e12 < best.d) best = { edge: [tri.i1, tri.i2], d: e12 };
    if (e20 < best.d) best = { edge: [tri.i2, tri.i0], d: e20 };
    
    // Emit via callback
    if (this.onEdgePick) {
      this.onEdgePick(hit, best.edge, tri);
    }
  }
  
  /**
   * Calculate squared distance from point to line segment
   * @private
   */
  _distPointToSegmentSq(p, a, b) {
    const ab = new THREE.Vector3().subVectors(b, a);
    const ap = new THREE.Vector3().subVectors(p, a);
    const t = THREE.MathUtils.clamp(ap.dot(ab) / ab.lengthSq(), 0, 1);
    const proj = new THREE.Vector3().copy(a).addScaledVector(ab, t);
    return proj.distanceToSquared(p);
  }
  
  dispose() {
    this.pickables = [];
    this.onTrianglePick = null;
    this.onVertexPick = null;
    this.onEdgePick = null;
  }
}

/**
 * @fileoverview SelectionFX - Visual feedback for selections
 * 
 * Handles all selection visualization:
 * - Triangle highlights
 * - Edge highlights  
 * - Pulse animations
 * 
 * No picking logic - only visualization of given selections
 */

import * as THREE from "three";

/**
 * Selection visual effects system
 */
export class SelectionFX {
  constructor() {
    // FX overlays
    this.triFX = null;
    this.edgeFX = null;
    
    // Pulse animation state
    this.pulseEnabled = false;
    this.pulseStart = 0;
    this.pulseDuration = 0.6; // seconds
  }
  
  /**
   * Show triangle highlight
   * @param {THREE.Mesh} mesh - The mesh containing the triangle
   * @param {object} tri - Triangle vertex indices {i0, i1, i2}
   */
  showTriangle(mesh, tri) {
    this.clear();
    
    const geom = mesh.geometry;
    if (!geom) return;
    
    const pos = geom.attributes.position;
    
    // Build in mesh LOCAL coordinates
    const a = new THREE.Vector3().fromBufferAttribute(pos, tri.i0);
    const b = new THREE.Vector3().fromBufferAttribute(pos, tri.i1);
    const c = new THREE.Vector3().fromBufferAttribute(pos, tri.i2);
    
    const triGeom = new THREE.BufferGeometry().setFromPoints([a, b, c]);
    triGeom.setIndex([0, 1, 2]);
    triGeom.computeVertexNormals();
    
    const triMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -2, // Pull slightly forward to avoid z-fighting
    });
    
    this.triFX = new THREE.Mesh(triGeom, triMat);
    
    // Attach to mesh so it inherits transforms
    mesh.add(this.triFX);
    
    this.startPulse();
  }
  
  /**
   * Show edge highlight (nearest edge in triangle)
   * @param {THREE.Mesh} mesh - The mesh containing the edge
   * @param {THREE.Vector3} hitPoint - World space hit point
   * @param {object} tri - Triangle vertex indices {i0, i1, i2}
   */
  showEdge(mesh, hitPoint, tri) {
    this.clear();
    
    const geom = mesh.geometry;
    if (!geom) return;
    
    const pos = geom.attributes.position;
    
    const a = new THREE.Vector3().fromBufferAttribute(pos, tri.i0);
    const b = new THREE.Vector3().fromBufferAttribute(pos, tri.i1);
    const c = new THREE.Vector3().fromBufferAttribute(pos, tri.i2);
    
    // Compare distance in WORLD space to choose best edge
    const Aw = a.clone();
    const Bw = b.clone();
    const Cw = c.clone();
    mesh.localToWorld(Aw);
    mesh.localToWorld(Bw);
    mesh.localToWorld(Cw);
    
    const p = hitPoint;
    const dAB = this._distPointToSegmentSq(p, Aw, Bw);
    const dBC = this._distPointToSegmentSq(p, Bw, Cw);
    const dCA = this._distPointToSegmentSq(p, Cw, Aw);
    
    let e0 = a, e1 = b;
    if (dBC < dAB && dBC <= dCA) { e0 = b; e1 = c; }
    else if (dCA < dAB && dCA < dBC) { e0 = c; e1 = a; }
    
    // Render edge in LOCAL space as a line attached to mesh
    const g = new THREE.BufferGeometry().setFromPoints([e0, e1]);
    const m = new THREE.LineBasicMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0.6,
      linewidth: 2
    });
    
    this.edgeFX = new THREE.Line(g, m);
    mesh.add(this.edgeFX);
    
    this.startPulse();
  }
  
  /**
   * Clear all selection FX
   */
  clear() {
    if (this.triFX) {
      this.triFX.parent?.remove(this.triFX);
      this.triFX.geometry?.dispose?.();
      this.triFX.material?.dispose?.();
      this.triFX = null;
    }
    if (this.edgeFX) {
      this.edgeFX.parent?.remove(this.edgeFX);
      this.edgeFX.geometry?.dispose?.();
      this.edgeFX.material?.dispose?.();
      this.edgeFX = null;
    }
    this.pulseEnabled = false;
  }
  
  /**
   * Start pulse animation
   */
  startPulse() {
    this.pulseEnabled = true;
    this.pulseStart = performance.now() / 1000;
  }
  
  /**
   * Update pulse animation (call in render loop)
   * @param {number} timeSec - Current time in seconds
   */
  updatePulse(timeSec) {
    if (!this.pulseEnabled) return;
    
    const u = (timeSec - this.pulseStart) / this.pulseDuration;
    if (u >= 1) {
      this.pulseEnabled = false;
      // Leave highlight at steady visibility at end
      this._setOpacity(0.35);
      return;
    }
    
    // Smooth pulse: 0..1..0
    const w = Math.sin(Math.PI * u);
    const opacity = 0.15 + 0.35 * w;
    this._setOpacity(opacity);
  }
  
  /**
   * Set opacity of FX overlays
   * @private
   */
  _setOpacity(a) {
    if (this.triFX?.material) this.triFX.material.opacity = a;
    if (this.edgeFX?.material) this.edgeFX.material.opacity = Math.min(1, a + 0.25);
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
    this.clear();
  }
}

/**
 * @fileoverview PinMarker - Vertex selection marker
 * 
 * Standalone visual marker for indicating selected vertices.
 * Uses Line2 (thick lines) for the stem and a sphere for the head.
 * Includes pulse animation on selection.
 */

import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

/**
 * PinMarker class - visual indicator for selected vertices
 */
export class PinMarker {
  constructor(scene, renderer, opts = {}) {
    this.scene = scene;
    this.renderer = renderer;

    // Base sizes (will be scaled relative to mesh)
    this.baseLength = opts.length ?? 0.15;        // as fraction of mesh radius
    this.baseHeadRadius = opts.headRadius ?? 0.02; // as fraction of mesh radius
    this.meshScale = 1.0;                          // scale factor from mesh bounds
    
    this.length = this.baseLength * this.meshScale;
    this.headRadius = this.baseHeadRadius * this.meshScale;
    this.color = opts.color ?? 0xffcc00;

    // Thick line (Line2) stem
    this.lineGeom = new LineGeometry();
    this.lineGeom.setPositions([0, 0, 0, 0, 1, 0]); // placeholder

    this.lineMat = new LineMaterial({
      color: this.color,
      linewidth: opts.lineWidthPx ?? 2.5, // in pixels when worldUnits=false
      transparent: true,
      opacity: 1.0,
      depthTest: true,
      depthWrite: false,
      worldUnits: false
    });

    // IMPORTANT: LineMaterial requires resolution (pixels)
    this._updateResolution();

    this.line = new Line2(this.lineGeom, this.lineMat);
    this.line.computeLineDistances();

    // Sphere head
    const sphGeom = new THREE.SphereGeometry(this.headRadius, 16, 16);
    const sphMat = new THREE.MeshStandardMaterial({
      color: this.color,
      roughness: 0.25,
      metalness: 0.0,
      emissive: new THREE.Color(this.color),
      emissiveIntensity: 0.25
    });
    this.head = new THREE.Mesh(sphGeom, sphMat);

    // Group for convenience
    this.group = new THREE.Group();
    this.group.renderOrder = 50; // draw later
    this.group.add(this.line);
    this.group.add(this.head);

    this.scene.add(this.group);

    // State
    this.visible = false;
    this.group.visible = false;

    // Optional pulse
    this._pulse = { active: false, t0: 0, dur: 0.35 };
  }

  _updateResolution() {
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    this.lineMat.resolution.set(size.x, size.y);
  }

  onResize() {
    this._updateResolution();
  }

  setLength(length) {
    this.length = length;
  }

  /**
   * Scale the pin marker based on mesh bounds
   * @param {number} meshRadius - The bounding sphere radius of the mesh
   */
  setScale(meshRadius) {
    this.meshScale = meshRadius;
    this.length = this.baseLength * this.meshScale;
    this.headRadius = this.baseHeadRadius * this.meshScale;
    
    // Update sphere geometry
    const newSphereGeom = new THREE.SphereGeometry(this.headRadius, 16, 16);
    this.head.geometry.dispose();
    this.head.geometry = newSphereGeom;
  }

  hide() {
    this.visible = false;
    this.group.visible = false;
  }

  /**
   * Position pin at a vertex on a mesh
   * @param {THREE.Mesh} mesh - The mesh containing the vertex
   * @param {number} vidx - Vertex index (0-based)
   * @param {THREE.Camera} camera - Optional camera for fallback direction
   */
  setFromVertexIndex(mesh, vidx, camera = null) {
    const g = mesh.geometry;
    const pos = g?.attributes?.position;
    if (!pos || vidx < 0 || vidx >= pos.count) return;

    // Vertex position in WORLD space
    const p = new THREE.Vector3().fromBufferAttribute(pos, vidx);
    mesh.localToWorld(p);

    // Direction: use vertex normal if available, else camera direction fallback
    let dir = new THREE.Vector3(0, 1, 0);
    const nAttr = g.attributes.normal;
    if (nAttr) {
      dir.fromBufferAttribute(nAttr, vidx);
      // transform normal to world direction
      dir.transformDirection(mesh.matrixWorld).normalize().negate();
    } else if (camera) {
      // fallback: point toward camera a bit
      dir.subVectors(camera.position, p).normalize();
    }

    const tip = new THREE.Vector3().copy(p).addScaledVector(dir, this.length);

    // Update stem geometry in world coordinates
    this.lineGeom.setPositions([
      p.x, p.y, p.z,
      tip.x, tip.y, tip.z
    ]);
    this.line.computeLineDistances();

    // Head at the tip
    this.head.position.copy(tip);

    // Show
    this.visible = true;
    this.group.visible = true;

    // Kick a small pulse
    this._pulse.active = true;
    this._pulse.t0 = performance.now() / 1000;
  }

  updatePulse(tSec) {
    if (!this.visible) return;

    const pulse = this._pulse;
    if (!pulse.active) return;

    const u = (tSec - pulse.t0) / pulse.dur;
    if (u >= 1) {
      pulse.active = false;
      this.head.scale.setScalar(1.0);
      this.lineMat.opacity = 1.0;
      return;
    }

    const w = Math.sin(Math.PI * u); // 0→1→0
    const s = 1.0 + 0.35 * w;
    this.head.scale.setScalar(s);
    this.lineMat.opacity = 0.75 + 0.25 * w;
  }

  dispose() {
    if (this.group) {
      this.scene.remove(this.group);
    }
    this.lineGeom?.dispose();
    this.lineMat?.dispose();
    this.head?.geometry?.dispose();
    this.head?.material?.dispose();
  }
}

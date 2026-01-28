/**
 * @file dispose.js
 * Utility functions for disposing Three.js objects and releasing GPU resources.
 */

/**
 * Recursively dispose of a Three.js Object3D and all its children.
 * Releases geometry and material resources.
 * @param {THREE.Object3D} obj - The object to dispose
 */
export function disposeObject3D(obj) {
  obj.traverse((o) => {
    if (o.geometry && typeof o.geometry.dispose === "function") {
      o.geometry.dispose();
    }
    if (o.material) {
      if (Array.isArray(o.material)) {
        o.material.forEach((m) => m && typeof m.dispose === "function" && m.dispose());
      } else if (typeof o.material.dispose === "function") {
        o.material.dispose();
      }
    }
  });
}

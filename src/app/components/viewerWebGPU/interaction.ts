/**
 * interaction.ts
 * 
 * Simple vertex picking for viewerWebGPU.
 * Uses raycasting to find mesh intersection and returns nearest vertex index.
 */

import * as THREE from 'three/webgpu';

interface PickingState {
  enabled: boolean;
  raycaster: THREE.Raycaster;
  mouse: THREE.Vector2;
  callback: ((vertexIndex: number, position: THREE.Vector3) => void) | null;
}

let state: PickingState = {
  enabled: false,
  raycaster: new THREE.Raycaster(),
  mouse: new THREE.Vector2(),
  callback: null
};

/**
 * Enable or disable vertex picking
 */
export function setPickingEnabled(enabled: boolean): void {
  state.enabled = enabled;
}

/**
 * Set callback for vertex pick events
 */
export function setPickingCallback(
  callback: ((vertexIndex: number, position: THREE.Vector3) => void) | null
): void {
  state.callback = callback;
}

/**
 * Initialize picking system
 */
export function initPicking(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  getMeshFn: () => THREE.Mesh | null
): void {
  // Setup raycaster
  state.raycaster.params.Points = { threshold: 0.1 };
  state.raycaster.params.Line = { threshold: 0.1 };

  // Mouse click handler
  const handleClick = (event: MouseEvent) => {
    if (!state.enabled) return;

    const mesh = getMeshFn();
    if (!mesh) {
      return;
    }

    // Calculate mouse position in normalized device coordinates (-1 to +1)
    const rect = canvas.getBoundingClientRect();
    state.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    state.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update raycaster
    state.raycaster.setFromCamera(state.mouse, camera);

    // Check for intersections
    const intersects = state.raycaster.intersectObject(mesh, false);

    if (intersects.length > 0) {
      const intersection = intersects[0];
      
      // Pass face index to enable O(1) triangle-local picking
      const faceIndex = intersection.faceIndex;
      const vertexIndex = findClosestVertex(mesh, intersection.point, faceIndex);

      if (vertexIndex !== -1) {
        const vertexPos = getVertexPosition(mesh, vertexIndex);

        if (state.callback) {
          state.callback(vertexIndex, vertexPos);
        }
      }
    }
  };

  // Add click listener
  canvas.addEventListener('click', handleClick);

}

/**
 * Find closest vertex to a 3D point among triangle vertices (O(1) complexity)
 * 
 * PERFORMANCE FIX: Instead of scanning all vertices O(nV), we only check
 * the 3 vertices of the intersected triangle.
 */
function findClosestVertex(mesh: THREE.Mesh, point: THREE.Vector3, faceIndex?: number): number {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  const index = geometry.index;

  if (!position) {
    return -1;
  }

  if (!index) {
    return -1;
  }

  // If we don't have face index from raycaster, fall back to linear search
  // (This shouldn't happen with proper raycaster usage)
  if (faceIndex === undefined) {
    return findClosestVertexSlow(mesh, point);
  }

  // Get the 3 vertex indices of the intersected triangle
  const i0 = index.getX(faceIndex * 3);
  const i1 = index.getX(faceIndex * 3 + 1);
  const i2 = index.getX(faceIndex * 3 + 2);

  const vertex = new THREE.Vector3();
  let closestIndex = -1;
  let closestDistance = Infinity;

  // Check only the 3 vertices of this triangle
  for (const vi of [i0, i1, i2]) {
    vertex.fromBufferAttribute(position, vi);
    vertex.applyMatrix4(mesh.matrixWorld);

    const distance = vertex.distanceToSquared(point);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = vi;
    }
  }

  return closestIndex;
}

/**
 * Slow fallback: search all vertices (O(nV) - AVOID THIS)
 */
function findClosestVertexSlow(mesh: THREE.Mesh, point: THREE.Vector3): number {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;

  let closestIndex = -1;
  let closestDistance = Infinity;

  const vertexCount = position.count;
  const vertex = new THREE.Vector3();

  // Search for closest vertex (slow!)
  for (let i = 0; i < vertexCount; i++) {
    vertex.fromBufferAttribute(position, i);
    vertex.applyMatrix4(mesh.matrixWorld);

    const distance = vertex.distanceToSquared(point);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = i;
    }
  }

  return closestIndex;
}

/**
 * Get vertex position by index
 */
function getVertexPosition(mesh: THREE.Mesh, vertexIndex: number): THREE.Vector3 {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;

  const vertex = new THREE.Vector3();
  vertex.fromBufferAttribute(position, vertexIndex);
  
  // Transform to world space
  vertex.applyMatrix4(mesh.matrixWorld);

  return vertex;
}

/**
 * Cleanup picking system
 */
export function disposePicking(canvas: HTMLCanvasElement): void {
  // Remove event listeners
  const oldCanvas = canvas;
  const newCanvas = oldCanvas.cloneNode(true) as HTMLCanvasElement;
  oldCanvas.parentNode?.replaceChild(newCanvas, oldCanvas);

  state.enabled = false;
  state.callback = null;

}

/**
 * Get current picking state
 */
export function isPickingEnabled(): boolean {
  return state.enabled;
}

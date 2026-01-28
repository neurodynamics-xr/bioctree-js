/**
 * manifold.ts
 * 
 * Manifold state manager - tracks the current loaded manifold and selected vertex.
 * 
 * This module ONLY manages state (which manifold is loaded, which vertex is selected).
 * Manifold creation and data ownership is handled by app/manifold/Manifold.ts.
 * 
 * Philosophy: One manifold per app session (single source of truth).
 * All compute, rendering, and interaction revolves around this single manifold.
 */

import { Manifold } from '../manifold/Manifold';

// State
let currentManifold: Manifold | null = null;
let currentVertexIdx: number | null = null;

// Listeners
let manifoldListeners: Set<(manifold: Manifold | null) => void> = new Set();
let vertexListeners: Set<(vertexIdx: number | null) => void> = new Set();

/**
 * Set the current manifold (single source of truth)
 */
export function setManifold(manifold: Manifold): void {
  currentManifold = manifold;
  currentVertexIdx = null; // Reset vertex selection when changing manifold
  
  notifyManifoldListeners();
  notifyVertexListeners();
}

/**
 * Get the current manifold
 */
export function getManifold(): Manifold | null {
  return currentManifold;
}

/**
 * Clear the current manifold
 */
export function clearManifold(): void {
  if (currentManifold) {
    currentManifold.dispose();
  }
  currentManifold = null;
  currentVertexIdx = null;
  
  notifyManifoldListeners();
  notifyVertexListeners();
}

/**
 * Check if a manifold is loaded
 */
export function isManifoldLoaded(): boolean {
  return currentManifold !== null;
}

//=============================================================================
// Vertex Selection State
//=============================================================================

/**
 * Set the currently selected vertex
 */
export function setCurrentVertex(vertexIdx: number | null): void {
  if (!currentManifold) {
    return;
  }

  if (vertexIdx !== null && !currentManifold.isValidVertexIndex(vertexIdx)) {
    return;
  }

  currentVertexIdx = vertexIdx;
  notifyVertexListeners();
  
  if (vertexIdx !== null) {
  } else {
  }
}

/**
 * Get the currently selected vertex
 */
export function getCurrentVertex(): number | null {
  return currentVertexIdx;
}

/**
 * Clear vertex selection
 */
export function clearCurrentVertex(): void {
  setCurrentVertex(null);
}

//=============================================================================
// Convenience Accessors (delegate to Manifold)
//=============================================================================

/**
 * Get number of vertices
 */
export function getVertexCount(): number {
  if (!currentManifold) {
    throw new Error('[ManifoldState] No manifold loaded');
  }
  return currentManifold.nV;
}

/**
 * Get number of faces
 */
export function getFaceCount(): number {
  if (!currentManifold) {
    throw new Error('[ManifoldState] No manifold loaded');
  }
  return currentManifold.nF;
}

/**
 * Get number of edges (if topology available)
 */
export function getEdgeCount(): number | null {
  return currentManifold?.nE || null;
}

/**
 * Get number of eigenmodes (if spectral data available)
 */
export function getEigenvalueCount(): number | null {
  return currentManifold?.K || null;
}

/**
 * Check if geometry data is available
 */
export function hasGeometry(): boolean {
  return currentManifold?.hasGeometry() || false;
}

/**
 * Check if topology data is available
 */
export function hasTopology(): boolean {
  return currentManifold?.hasTopology() || false;
}

/**
 * Check if eigenmode data is available
 */
export function hasEigenmodes(): boolean {
  return currentManifold?.hasEigenmodes() || false;
}

/**
 * Get manifold bounds
 */
export function getBounds(): {
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
  radius: number;
} | null {
  return currentManifold?.geometry.bounds || null;
}

/**
 * Get spectral data (eigenmodes)
 */
export function getSpectralData() {
  return currentManifold?.eigenmodes || null;
}

/**
 * Validate vertex index
 */
export function isValidVertexIndex(vertexIdx: number): boolean {
  return currentManifold?.isValidVertexIndex(vertexIdx) || false;
}

/**
 * Validate face index
 */
export function isValidFaceIndex(faceIdx: number): boolean {
  return currentManifold?.isValidFaceIndex(faceIdx) || false;
}

/**
 * Validate edge index
 */
export function isValidEdgeIndex(edgeIdx: number): boolean {
  return currentManifold?.isValidEdgeIndex(edgeIdx) || false;
}

/**
 * Get vertex position
 */
export function getVertexPosition(idx: number): [number, number, number] | null {
  return currentManifold?.getVertexPosition(idx) || null;
}

/**
 * Get face vertices
 */
export function getFaceVertices(idx: number): [number, number, number] | null {
  return currentManifold?.getFaceVertices(idx) || null;
}

//=============================================================================
// Listeners
//=============================================================================

/**
 * Subscribe to manifold changes
 */
export function onManifoldChange(listener: (manifold: Manifold | null) => void): () => void {
  manifoldListeners.add(listener);
  
  // Return unsubscribe function
  return () => {
    manifoldListeners.delete(listener);
  };
}

/**
 * Subscribe to vertex selection changes
 */
export function onVertexSelectionChange(listener: (vertexIdx: number | null) => void): () => void {
  vertexListeners.add(listener);
  
  // Return unsubscribe function
  return () => {
    vertexListeners.delete(listener);
  };
}

/**
 * Notify manifold listeners
 */
function notifyManifoldListeners(): void {
  manifoldListeners.forEach(listener => {
    try {
      listener(currentManifold);
    } catch (error) {
    }
  });
}

/**
 * Notify vertex selection listeners
 */
function notifyVertexListeners(): void {
  vertexListeners.forEach(listener => {
    try {
      listener(currentVertexIdx);
    } catch (error) {
    }
  });
}

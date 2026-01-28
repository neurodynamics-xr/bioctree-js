/**
 * main.ts
 * 
 * Entry point for viewerWebGPU.
 * Provides public API for React integration.
 */

import * as ViewerRenderer from './render';
import type { ColormapType } from '../../tsl/colormap';
import type { ScalarField } from '../../tsl/types';

export interface ViewerWebGPUAPI {
  setMeshFromManifold: (manifold: any) => void;
  setFieldColormap: (scalarStorage: any, colormap: ColormapType, minValue: number, maxValue: number) => void;
  clearFieldColormap: () => void;
  
  // Interactive visualization API (TSL atlas-based colormaps)
  setColormapIndex: (index: number) => void;
  setColormapByName: (name: ColormapType) => void;
  setColorRange: (min: number, max: number) => void;
  setScalarSource: (source: 'none' | 'fieldBuffer' | 'eigenmode' | 'fractalNoise', bufferKey?: string) => void;
  
  // Active field API (for procedural fields)
  setActiveField: (field: ScalarField, opts?: { colormapIndex?: number; colormapName?: ColormapType; min?: number; max?: number }) => void;
  
  // Animation control
  stopAnimation: () => void;
  startAnimation: () => void;
  isAnimating: () => boolean;
  isFractalNoiseActive: () => boolean;
  
  // Viewer state getters
  getMesh: () => any;
  getMaterial: () => any;
  getRenderer: () => any;
  getCamera: () => any;
  getScene: () => any;
  getRoots: () => any;
  
  // Picking
  enablePicking: (enabled: boolean) => void;
  onVertexPick: (callback: ((vertexIndex: number, position: any) => void) | null) => void;
  pickingEnabled: () => boolean;
  
  // Lifecycle
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

/**
 * Initialize the WebGPU viewer
 */
export async function initViewer(
  canvasEl: HTMLCanvasElement,
  config?: {
    backgroundColor?: number;
    cameraConfig?: any;
  }
): Promise<ViewerWebGPUAPI> {
  // Initialize renderer
  await ViewerRenderer.init(canvasEl, config);

  // Return public API
  return {
    setMeshFromManifold: ViewerRenderer.setMeshFromManifold,
    setFieldColormap: ViewerRenderer.setFieldColormap,
    clearFieldColormap: ViewerRenderer.clearFieldColormap,
    
    // Interactive visualization API
    setColormapIndex: ViewerRenderer.setColormapIndex,
    setColormapByName: ViewerRenderer.setColormapByName,
    setColorRange: ViewerRenderer.setColorRange,
    setScalarSource: ViewerRenderer.setScalarSource,
    
    // Active field API
    setActiveField: ViewerRenderer.setActiveField,
    
    // Animation control
    stopAnimation: ViewerRenderer.stopAnimation,
    startAnimation: ViewerRenderer.startAnimation,
    isAnimating: ViewerRenderer.isAnimating,
    isFractalNoiseActive: ViewerRenderer.isFractalNoiseActive,
    
    // Viewer state getters
    getMesh: ViewerRenderer.getMesh,
    getMaterial: ViewerRenderer.getMaterial,
    getRenderer: ViewerRenderer.getRenderer,
    getCamera: ViewerRenderer.getCamera,
    getScene: ViewerRenderer.getScene,
    getRoots: ViewerRenderer.getRoots,
    
    // Picking
    enablePicking: ViewerRenderer.enablePicking,
    onVertexPick: ViewerRenderer.onVertexPick,
    pickingEnabled: ViewerRenderer.pickingEnabled,
    resize: ViewerRenderer.resize,
    dispose: ViewerRenderer.dispose
  };
}

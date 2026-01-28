/**
 * ViewerWebGPU - WebGPU-native 3D viewer for compute-heavy visualizations
 * 
 * Refactored to use modular viewerWebGPU structure.
 * See: viewerWebGPU/main.ts, viewerWebGPU/render.ts
 */

import { useEffect, useRef, useState } from 'react';
import { initViewer, type ViewerWebGPUAPI } from './viewerWebGPU/main';
import { getGPU } from './viewerWebGPU/render';
import { setCurrentVertex } from '@/app/state/manifold';
import { Manifold } from '@/app/manifold/Manifold';
import { Field } from '@/app/field/Field';
import type { ColormapType } from '@/app/tsl/colormap';
import type { SpectralBrushConfig } from './panels/SpectralBrushPanel';
import { vertexIndex } from 'three/tsl';

/**
 * Extended API that wraps low-level ViewerWebGPUAPI
 * Handles Manifold objects and routes data to low-level renderer
 */
export interface ViewerWebGPUExtendedAPI extends ViewerWebGPUAPI {
  setMeshFromManifold: (manifold: Manifold) => void;
  setFieldVisualization: (field: Field, colormap?: ColormapType, minVal?: number, maxVal?: number) => void;
  clearFieldVisualization: () => void;
}

interface ViewerWebGPUProps {
  className?: string;
  pickingEnabled?: boolean;
  spectralBrushConfig?: SpectralBrushConfig;
  onStateChange?: (state: ViewerState) => void;
  onReady?: (api: ViewerWebGPUExtendedAPI) => void;
  onVertexPick?: (vertexIdx: number, position: { x: number; y: number; z: number }) => void;
}

interface ViewerState {
  status: 'initializing' | 'ready' | 'loading' | 'error';
  error?: string;
  meshLoaded: boolean;
  vertexCount: number;
  faceCount: number;
}

export function ViewerWebGPU({ 
  className = '',
  pickingEnabled = false,
  spectralBrushConfig, // TODO: Implement spectral brush
  onStateChange,
  onReady,
  onVertexPick 
}: ViewerWebGPUProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<ViewerState>({
    status: 'initializing',
    meshLoaded: false,
    vertexCount: 0,
    faceCount: 0
  });
  
  const apiRef = useRef<ViewerWebGPUAPI | null>(null);
  const viewerInitialized = useRef(false);

  // Note: Scalar field visualization will be implemented via new method
  // Heat kernel visualization removed - will be replaced with general field viz

  // Initialize viewer
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current || viewerInitialized.current) {
      return;
    }

    const initializeViewer = async () => {
      try {
        setState(prev => ({ ...prev, status: 'initializing' }));

        const canvas = canvasRef.current!;

        // Initialize viewer using modular structure
        const api = await initViewer(canvas, {
          backgroundColor: 0x000000,
          cameraConfig: {
            fov: 45,
            near: 0.1,
            far: 10000,
            position: [0, 0, 300] as [number, number, number],
            up: [0, 1, 0] as [number, number, number]
          }
        });

        apiRef.current = api;
        viewerInitialized.current = true;

        // Note: Renderer and scene references removed (heat kernel viz removed)
        // For future scalar visualization, access via api.getRenderer()/api.getScene()

        setState(prev => ({ ...prev, status: 'ready' }));

        // Setup vertex picking callback - updates manifold state
        api.onVertexPick((vertexIndex: number, position: any) => {
          
          // Update global manifold state
          setCurrentVertex(vertexIndex);
          
          // Also notify parent component if callback provided
          if (onVertexPick) {
            onVertexPick(vertexIndex, {
              x: position.x,
              y: position.y,
              z: position.z
            });
          }
        });

        // Create extended API with Manifold and Field support
        const extendedAPI: ViewerWebGPUExtendedAPI = {
          ...api,
          setMeshFromManifold: (manifold: Manifold) => {
            // Pass directly to render layer
            api.setMeshFromManifold(manifold);
          },
          setFieldVisualization: (
            field: Field, 
            colormap: ColormapType = 'inferno',
            minVal?: number,
            maxVal?: number
          ) => {
            // Validate field domain
            if (field.metadata.domain !== 'vertex') {
              return;
            }
            
            // Get GPU resource manager
            const gpuManager = getGPU();
            if (!gpuManager) {
              return;
            }
            
            // Bind field to get scalar node
            const bindResult = field.bind({
              gpu: gpuManager,
              vertexIndexNode: vertexIndex
            });
            
            // Extract scalar storage from bind result
            // For buffer fields, we need to get the actual storage object
            let scalarStorage: any = null;
            
            if ('resourceKey' in field.backend) {
              const buffer = gpuManager.getBuffer((field.backend as any).resourceKey);
              if (!buffer) {
                return;
              }
              scalarStorage = (buffer as any).buffer; // StorageBufferAttribute
            } else {
              return;
            }
            
            // Use field.metadata.range if available, avoid CPU scanning
            let min = minVal;
            let max = maxVal;
            if (min === undefined || max === undefined) {
              // Try to use pre-computed range from metadata or bind result
              const range = bindResult.range || field.metadata.range;
              if (range) {
                min = min ?? range[0];
                max = max ?? range[1];
              } else {
                // Fallback: compute on CPU (should be rare, field loaders should set range)
                const array = scalarStorage.array;
                let computedMin = Infinity;
                let computedMax = -Infinity;
                for (let i = 0; i < array.length; i++) {
                  if (array[i] < computedMin) computedMin = array[i];
                  if (array[i] > computedMax) computedMax = array[i];
                }
                min = min ?? computedMin;
                max = max ?? computedMax;
              }
            }
            
            // Pass to render layer with colormap info
            api.setFieldColormap(scalarStorage, colormap, min, max);
            
            // Store dispose function if provided
            if (bindResult.dispose) {
              // TODO: Track dispose function for cleanup
            }
          },
          clearFieldVisualization: () => {
            api.clearFieldColormap();
          },
        };

        // Expose API for testing
        (window as any).__viewerWebGPU = extendedAPI;

        if (onReady) {
          onReady(extendedAPI);
        }

        if (onStateChange) {
          onStateChange({ ...state, status: 'ready' });
        }

      } catch (error) {
        setState(prev => ({ 
          ...prev, 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        }));
        
        if (onStateChange) {
          onStateChange({ 
            ...state, 
            status: 'error', 
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    };

    initializeViewer();

    // Cleanup on unmount
    return () => {
      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
      viewerInitialized.current = false;
      (window as any).__viewerWebGPU = undefined;
    };
  }, []);

  // Control picking enable/disable based on prop
  useEffect(() => {
    if (apiRef.current) {
      apiRef.current.enablePicking(pickingEnabled);
    }
  }, [pickingEnabled]);

  // Handle canvas resize using ResizeObserver
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (canvasRef.current && containerRef.current && apiRef.current) {
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        
        // NEW: Use new resize() API from render.ts
        apiRef.current.resize(width, height);
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Notify state changes
  useEffect(() => {
    if (onStateChange) {
      onStateChange(state);
    }
  }, [state, onStateChange]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full ${className}`}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full bg-black"
        style={{ display: 'block' }}
      />
      
      {/* Status overlay */}
      {state.status === 'initializing' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-white">Initializing WebGPU...</div>
        </div>
      )}
      {state.status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-red-500">Error: {state.error}</div>
        </div>
      )}
    </div>
  );
}

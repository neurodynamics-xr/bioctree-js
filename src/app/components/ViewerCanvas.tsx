import { useEffect, useRef } from 'react';
// @ts-ignore - viewer/render.js is a JavaScript module without type declarations
import { initViewer, subscribeToState, setPickMode, setPickingEnabled, setPickCallbacks } from './viewer/render.js';

interface ViewerCanvasProps {
  onStateChange?: (state: any) => void;
  pickingMode?: 'vertex' | 'edge' | 'triangle' | null;
  onVertexPick?: (vertexIdx: number, position: { x: number; y: number; z: number }) => void;
  onEdgePick?: (edge: [number, number]) => void;
  onTrianglePick?: (faceIdx: number) => void;
}

export function ViewerCanvas({ 
  onStateChange,
  pickingMode,
  onVertexPick,
  onEdgePick,
  onTrianglePick
}: ViewerCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerInitialized = useRef(false);
  const onStateChangeRef = useRef(onStateChange);
  const onVertexPickRef = useRef(onVertexPick);
  const onEdgePickRef = useRef(onEdgePick);
  const onTrianglePickRef = useRef(onTrianglePick);

  // Keep refs up to date
  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    onVertexPickRef.current = onVertexPick;
  }, [onVertexPick]);

  useEffect(() => {
    onEdgePickRef.current = onEdgePick;
  }, [onEdgePick]);

  useEffect(() => {
    onTrianglePickRef.current = onTrianglePick;
  }, [onTrianglePick]);

  // Handle picking mode changes
  useEffect(() => {
    if (!viewerInitialized.current) return;
    
    if (pickingMode) {
      setPickMode(pickingMode);
      setPickingEnabled(true);
    } else {
      setPickingEnabled(false);
    }
  }, [pickingMode]);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current || viewerInitialized.current) {
      return;
    }

    // Initialize the Three.js viewer
    const initializeViewer = async () => {
      try {
        await initViewer({
          canvasEl: canvasRef.current!,
          hudEl: null, // No HUD element needed in React app
          glbUrl: null // No default mesh - will be loaded via UI
        });
        
        viewerInitialized.current = true;
        // Set up picking callbacks
        setPickCallbacks({
          onVertexPick: (vertexIdx: number, hit: any) => {
            if (onVertexPickRef.current) {
              // Extract vertex position from the mesh geometry
              const mesh = hit.object;
              const geom = mesh.geometry;
              if (geom && geom.attributes.position) {
                const pos = geom.attributes.position;
                const x = pos.getX(vertexIdx);
                const y = pos.getY(vertexIdx);
                const z = pos.getZ(vertexIdx);
                onVertexPickRef.current(vertexIdx, { x, y, z });
              } else {
                onVertexPickRef.current(vertexIdx, { x: 0, y: 0, z: 0 });
              }
            }
          },
          onEdgePick: (edge: [number, number]) => {
            if (onEdgePickRef.current) {
              onEdgePickRef.current(edge);
            }
          },
          onTrianglePick: (tri: any) => {
            if (onTrianglePickRef.current) {
              onTrianglePickRef.current(tri.i0); // Use first vertex index as face ID
            }
          }
        });

        // Subscribe to viewer state changes
        const unsubscribe = subscribeToState((event: string, currentState: any) => {
          if (onStateChangeRef.current) {
            // Map viewer state to React ViewerState interface
            const mappedState = {
              appState: currentState.state || 'idle',
              mesh: {
                status: currentState.mesh?.status || 'none',
                vertexCount: currentState.mesh?.vertexCount || 0,
                faceCount: currentState.mesh?.faceCount || 0,
                bounds: currentState.mesh?.bounds || null,
              },
              data: {
                status: currentState.data?.status || 'none',
                type: currentState.data?.type || null,
                count: currentState.data?.count || 0,
                range: currentState.data?.range || [0, 1],
              },
            };
            onStateChangeRef.current(mappedState);
          }
        });

        // Store unsubscribe for cleanup
        return unsubscribe;
      } catch (error) {
      }
    };

    const cleanupPromise = initializeViewer();

    // Cleanup subscription on unmount
    return () => {
      cleanupPromise?.then((unsubscribe) => {
        if (unsubscribe) unsubscribe();
      });
    };
  }, []); // Empty deps - only run once

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full bg-black"
        style={{ display: 'block' }}
      />
    </div>
  );
}

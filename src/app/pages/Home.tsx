/**
 * Home.tsx
 * 
 * Main application page with full app functionality.
 * Clean implementation using new manifold/field state system.
 * 
 * Architecture:
 * - State-driven: Listens to app/state/manifold and app/state/field
 * - ViewerWebGPU: Renders current manifold/field from state
 * - IO Module: Loads data → updates state → viewer reacts
 */

import { useState, useEffect, useRef } from 'react';
import { HomeLayout } from '../layouts/HomeLayout';
import { LeftSidebar } from '../components/LeftSidebar';
import { ViewerWebGPU, type ViewerWebGPUExtendedAPI } from '../components/ViewerWebGPU';
import { ViewerControls } from '../components/ViewerControls';
import { StatusReadout } from '../components/StatusReadout';
import { SpectralBrushPanel, type SpectralBrushConfig } from '../components/panels/SpectralBrushPanel';
import { DockPanel } from '../components/DockPanel';
import { onManifoldChange, onVertexSelectionChange, setCurrentVertex } from '../state/manifold';
import { onCurrentFieldChange } from '../state/field';
import { getManifold } from '../state/manifold';
import * as renderAPI from '../components/viewerWebGPU/render';
import type { ViewerState } from '../hooks/useViewerState';
import type {
  BrushFamily,
  SimplexType,
  PatchType,
  BrushPatchState,
  BrushPathState,
  BrushTimeState,
} from '../types/tools';

export function Home() {
  // Viewer API reference (stored for backward compatibility, prefer direct renderAPI access)
  const viewerAPI = useRef<ViewerWebGPUExtendedAPI | null>(null);

  // UI state
  const [selectedVertex, setSelectedVertex] = useState<number | null>(null);
  const [selectedVertexPosition, setSelectedVertexPosition] = useState<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const [currentFieldName, setCurrentFieldName] = useState<string | null>(null);
  const [meshLoaded, setMeshLoaded] = useState(false);
  const [meshInfo, setMeshInfo] = useState<{ nV: number; nF: number; K?: number } | null>(null);
  const [selectedEigenmode, setSelectedEigenmode] = useState<number | null>(null);

  // Spectral brush state
  const [spectralBrushConfig, setSpectralBrushConfig] = useState<SpectralBrushConfig>({
    tau: 0.01,
    Kactive: 256,
    selectedVertex: null,
    colormapType: 'inferno',
    enabled: false,
  });

  // Right sidebar state
  const [rightSidebarVisible, setRightSidebarVisible] = useState(false);

  // Tool state for ViewerControls
  const [brushFamily, setBrushFamily] = useState<BrushFamily>('none');
  const [simplexType, setSimplexType] = useState<SimplexType>('vertex');
  const [patchType, setPatchType] = useState<PatchType>('spectral');
  
  // Brush state for different families
  const [brushPatch, setBrushPatch] = useState<BrushPatchState>({
    kernel: 'nearest',
    size: 50,
    depthK: 3,
    heatT: 0.1,
    heatK: 100,
    sigma: 1.0,
    previewFootprint: true,
  });

  const [brushPath, setBrushPath] = useState<BrushPathState>({
    stepSize: 1.0,
  });

  const [brushTime, setBrushTime] = useState<BrushTimeState>({
    timeWindow: 1.0,
  });

  // Handle viewer ready
  const handleViewerReady = (api: ViewerWebGPUExtendedAPI) => {
    viewerAPI.current = api;

    // Expose API for debugging
    (window as any).__viewerAPI = api;
  };

  // Listen to manifold state changes
  useEffect(() => {
    const unsubscribe = onManifoldChange((manifold) => {
      if (manifold) {
        setMeshLoaded(true);
        setMeshInfo({
          nV: manifold.nV,
          nF: manifold.nF,
          K: manifold.K || undefined
        });

        // Direct access to render layer (check initialization first)
        if (renderAPI.getRenderer()) {
          renderAPI.setMeshFromManifold(manifold);
        } else {
        }
      } else {
        setMeshLoaded(false);
        setMeshInfo(null);
      }
    });

    return unsubscribe;
  }, []);

  // Listen to vertex selection changes
  useEffect(() => {
    const unsubscribe = onVertexSelectionChange((vertexIdx) => {
      setSelectedVertex(vertexIdx);
      // Update spectral brush config
      setSpectralBrushConfig((prev) => ({
        ...prev,
        selectedVertex: vertexIdx,
      }));

      // Show right sidebar when vertex is selected and mesh has spectral data
      if (vertexIdx !== null && meshInfo?.K) {
        setRightSidebarVisible(true);
        setSpectralBrushConfig((prev) => ({
          ...prev,
          enabled: true,
        }));
      }
    });

    return unsubscribe;
  }, [meshInfo]);

  // Listen to field state changes
  useEffect(() => {
    const unsubscribe = onCurrentFieldChange((field) => {
      if (field) {
        setCurrentFieldName(field.metadata.name);

        // TODO: Update viewer visualization with field data
        if (viewerAPI.current) {
        }
      } else {
        setCurrentFieldName(null);
      }
    });

    return unsubscribe;
  }, []);

  // Create ViewerState structure for StatusReadout
  const viewerState: ViewerState = {
    appState: meshLoaded ? 'ready' : 'idle',
    mesh: {
      status: meshLoaded ? 'loaded' : 'none',
      vertexCount: meshInfo?.nV || 0,
      faceCount: meshInfo?.nF || 0,
      bounds: null,
    },
    data: {
      status: currentFieldName ? 'loaded' : 'none',
      type: currentFieldName ? 'scalar' : null,
      count: meshInfo?.nV || 0,
      range: [0, 1],
    },
  };

  // Handler functions for ViewerControls
  const handleBrushFamilyChange = (family: BrushFamily) => {
    setBrushFamily(family);
    // TODO: Enable/disable picking based on brush type
  };

  const handleSimplexTypeChange = (type: SimplexType) => {
    setSimplexType(type);
  };

  const handlePatchTypeChange = (type: PatchType) => {
    setPatchType(type);
  };

  const handleClearField = () => {
    setCurrentFieldName(null);
    // TODO: Clear field visualization in viewer
    if (viewerAPI.current) {
      viewerAPI.current.clearFieldVisualization();
    }
  };

  // Handle eigenmode selection from ManifoldPanel
  const handleEigenmodeSelected = async (modeIndex: number) => {
    const manifold = getManifold();
    if (!manifold?.eigenmodes) {
      return;
    }

    try {
      // Check if this is first time BEFORE updating state
      const isFirstTime = selectedEigenmode === null;
      
      // Update state
      setSelectedEigenmode(modeIndex);

      // Enable eigenmode visualization (first time) or update mode (subsequent)
      if (isFirstTime) {
        // First time - enable visualization
        await renderAPI.enableEigenmodeVisualization(manifold, modeIndex);
      } else {
        // Update existing visualization
        renderAPI.setEigenmodeVisualizationParams({ modeIndex });
      }
    } catch (error) {
    }
  };

  return (
    <HomeLayout
      left={<LeftSidebar onEigenmodeSelected={handleEigenmodeSelected} />}
      main={
        <div className="relative w-full h-full">
          {/* ViewerWebGPU */}
          <ViewerWebGPU 
            onReady={handleViewerReady}
            pickingEnabled={true}
            spectralBrushConfig={spectralBrushConfig}
          />

          {/* ViewerControls overlaid on canvas */}
          <ViewerControls
            loadedFieldName={currentFieldName}
            onClearField={handleClearField}
            brushFamily={brushFamily}
            onBrushFamilyChange={handleBrushFamilyChange}
            simplexType={simplexType}
            onSimplexTypeChange={handleSimplexTypeChange}
            patchType={patchType}
            onPatchTypeChange={handlePatchTypeChange}
            brushPatch={brushPatch}
            brushPath={brushPath}
            brushTime={brushTime}
            onBrushPatchChange={setBrushPatch}
            onBrushPathChange={setBrushPath}
            onBrushTimeChange={setBrushTime}
          />
        </div>
      }
      bottom={
        <StatusReadout
          cursorPosition={selectedVertexPosition}
          vertexIndex={selectedVertex ?? undefined}
          fps={60}
          viewerState={viewerState}
        />
      }
      right={
        rightSidebarVisible && meshInfo?.K && (
          <div className="w-80 h-full bg-gray-900 border-l border-gray-800 overflow-y-auto">
            <DockPanel
              title="Spectral Brush"
              isOpen={true}
              onToggle={() => setRightSidebarVisible(false)}
            >
              <SpectralBrushPanel
                config={spectralBrushConfig}
                maxK={meshInfo.K}
                onTauChange={(tau) =>
                  setSpectralBrushConfig((prev) => ({ ...prev, tau }))
                }
                onKactiveChange={(Kactive) =>
                  setSpectralBrushConfig((prev) => ({ ...prev, Kactive }))
                }
                onColormapChange={(colormapType: any) =>
                  setSpectralBrushConfig((prev) => ({ ...prev, colormapType }))
                }
                onToggle={(enabled) =>
                  setSpectralBrushConfig((prev) => ({ ...prev, enabled }))
                }
              />
            </DockPanel>
          </div>
        )
      }
    />
  );
}

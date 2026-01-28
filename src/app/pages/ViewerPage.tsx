import { useState, useEffect, useRef } from 'react';
import { ViewerLayout } from '../layouts/ViewerLayout';
import { LeftSidebar } from '../components/LeftSidebar';
import { ViewerCanvas } from '../components/ViewerCanvas';
import { ViewerControls } from '../components/ViewerControls';
import { ChartViewerPanel } from '../components/ChartViewerPanel';
import { StatusReadout } from '../components/StatusReadout';
import { TimeSeriesControls, type TimeSeriesState } from '../components/TimeSeriesControls';
import { FieldChip } from '../components/FieldChip';
import { useViewerState, ViewerState } from '../hooks/useViewerState';
// @ts-ignore - JavaScript module without type definitions
import { setScalarData, getGPUDevice, getRenderer, executeCompute } from '../components/viewer/render.js';
import type { BCTSpectralData } from '../io/loaders/types';
import { HeatKernelTSL } from '../compute/spectral/heatKernelTSL';
import {
  ToolType,
  BrushFamily,
  SimplexType,
  PatchType,
  BrushPatchState,
  BrushPathState,
  BrushTimeState,
  FilterFamily,
  FilterHeatState,
  FilterWaveletState,
  FilterDiffusionState,
  FilterWaveState,
  FilterDampedWaveState,
  FilterDynamicState,
} from '../types/tools';

export function ViewerPage() {
  // Viewer state (synced from Three.js viewer)
  const { viewerState, setViewerState } = useViewerState();

  const handleViewerStateChange = (newState: ViewerState) => {
    setViewerState(newState);
  };

  // Active tool and sub-tools
  const [activeTool, setActiveTool] = useState<ToolType>('filter');
  const [brushFamily, setBrushFamily] = useState<BrushFamily>('none');
  const [simplexType, setSimplexType] = useState<SimplexType>('vertex');
  const [patchType, setPatchType] = useState<PatchType>('spectral');
  const [filterFamily, setFilterFamily] = useState<FilterFamily>('heat');

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

  // Filter state for different families
  const [filterHeat, setFilterHeat] = useState<FilterHeatState>({
    diffusivity: 0.1,
    timeStep: 0.01,
    iterations: 10,
  });

  const [filterWavelet, setFilterWavelet] = useState<FilterWaveletState>({
    level: 3,
    threshold: 0.5,
    waveletType: 'db4',
  });

  const [filterDiffusion, setFilterDiffusion] = useState<FilterDiffusionState>({
    lambda: 0.5,
    iterations: 10,
    preserveFeatures: true,
  });

  const [filterWave, setFilterWave] = useState<FilterWaveState>({
    frequency: 1.0,
    amplitude: 0.5,
    waveSpeed: 1.0,
  });

  const [filterDampedWave, setFilterDampedWave] = useState<FilterDampedWaveState>({
    frequency: 1.0,
    amplitude: 0.5,
    dampingFactor: 0.1,
    waveSpeed: 1.0,
  });

  const [filterDynamic, setFilterDynamic] = useState<FilterDynamicState>({
    timeWindow: 1.0,
    adaptiveRate: 0.5,
  });

  // BCT spectral data state
  const [bctData, setBctData] = useState<BCTSpectralData | null>(null);
  const [selectedEigenmode, setSelectedEigenmode] = useState<number | null>(null);

  // Heat kernel compute state (TSL-based)
  const heatKernelRef = useRef<HeatKernelTSL | null>(null);
  const [isComputingHeat, setIsComputingHeat] = useState(false);

  // Time-varying heat kernel animation state
  const [timeSeriesState, setTimeSeriesState] = useState<TimeSeriesState>({
    isPlaying: false,
    currentTime: 0,
    playbackSpeed: 1
  });
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastFrameTimeRef = useRef<number>(0);
  const maxDiffusionTime = 10.0; // seconds

  // Callback when BCT package is loaded
  const handleBCTLoaded = async (data: BCTSpectralData) => {
    setBctData(data);
    setSelectedEigenmode(null); // Reset selection
    
    // Initialize heat kernel compute with TSL
    try {
      if (!heatKernelRef.current) {
        heatKernelRef.current = new HeatKernelTSL();
      }
      
      await heatKernelRef.current.initialize(data);
    } catch (error) {
    }
  };

  // Callback when eigenmode is selected from chart
  const handleEigenmodeSelected = (modeIndex: number) => {
    setSelectedEigenmode(modeIndex);
  };

  // Eigenmode visualization effect
  useEffect(() => {
    if (!bctData || selectedEigenmode === null || viewerState.mesh.status !== 'loaded') {
      return;
    }

    try {
      // Extract eigenvector from psi (row-major layout: K x nV)
      // Each row is one eigenmode
      const { psi, nV, K, lambda } = bctData;
      
      if (selectedEigenmode >= K) {
        return;
      }
      
      // Extract the eigenmode row (eigenvector values for all vertices)
      const eigenvector = new Float32Array(nV);
      const rowOffset = selectedEigenmode * nV;
      
      for (let i = 0; i < nV; i++) {
        eigenvector[i] = psi[rowOffset + i];
      }
      
      // Get eigenvalue for logging
      const eigenvalue = lambda[selectedEigenmode];
      // Apply to viewer using existing scalar data API
      setScalarData({
        action: 'update',
        name: `Eigenmode ${selectedEigenmode} (λ=${eigenvalue.toFixed(6)})`,
        data: eigenvector
      });
      
    } catch (error) {
    }
  }, [selectedEigenmode, bctData, viewerState.mesh.status]);

  // Time-varying heat kernel animation loop
  useEffect(() => {
    if (!timeSeriesState.isPlaying || !heatKernelRef.current || !bctData) {
      return;
    }

    const sourceVertex = heatKernelRef.current.getCurrentSourceVertex();
    if (sourceVertex < 0) {
      return;
    }

    const renderer = getRenderer();
    if (!renderer) {
      return;
    }

    const { coeffCompute, fieldCompute } = heatKernelRef.current.getComputeNodes();

    const animate = async (timestamp: number) => {
      if (!lastFrameTimeRef.current) {
        lastFrameTimeRef.current = timestamp;
      }

      lastFrameTimeRef.current = timestamp;

      // Update diffusion time based on playback state
      const diffT = timeSeriesState.currentTime * maxDiffusionTime;

      try {
        // Update tau uniform (automatically updates GPU)
        if (heatKernelRef.current) {
          const currentParams = {
            selectedVertex: heatKernelRef.current.getCurrentSourceVertex(),
            tau: diffT,
            Kactive: Math.min(Math.round(brushPatch.heatK), bctData.K)
          };
          heatKernelRef.current.setParams(currentParams);

          // Execute compute passes (zero-copy GPU-only)
          renderer.compute(coeffCompute);
          renderer.compute(fieldCompute);
          
          // Heat field is now updated in GPU storage buffer
          // Rendering will automatically read updated values (zero-copy)
        }
        
        // Request next frame if still playing
        if (timeSeriesState.isPlaying) {
          animationFrameRef.current = requestAnimationFrame(animate);
        }
      } catch (error) {
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      lastFrameTimeRef.current = 0;
    };
  }, [timeSeriesState.isPlaying, timeSeriesState.currentTime, bctData, brushPatch.heatK]);

  // Selection state
  const [hasSelection, setHasSelection] = useState(false);

  // Picking state
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | undefined>(undefined);
  const [selectedVertexPosition, setSelectedVertexPosition] = useState<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const [pickingMode, setPickingMode] = useState<'vertex' | 'edge' | 'triangle' | null>(null);

  // Field state
  const [selectedField, setSelectedField] = useState('');
  const [loadedFieldName, setLoadedFieldName] = useState<string | null>(null);
  const [isLoadingField, setIsLoadingField] = useState(false);
  // Field loading effect - auto-load when selection changes
  useEffect(() => {
    const loadField = async () => {
      if (!selectedField || viewerState.mesh.status !== 'loaded') {
        // Clear field if no selection or no mesh
        if (loadedFieldName) {
          handleClearField();
        }
        return;
      }
      setIsLoadingField(true);
      try {
        // Load JSON metadata
        const metadataResponse = await fetch(`/src/app/components/viewer/assets/${selectedField}.json`);
        if (!metadataResponse.ok) throw new Error('Failed to load field metadata');
        
        const fieldData = await metadataResponse.json();
        
        if (fieldData.type === 'scalar') {
          // Load binary data file
          const dataUrl = `/src/app/components/viewer/assets/${fieldData.data}`;
          const dataResponse = await fetch(dataUrl);
          if (!dataResponse.ok) throw new Error(`Failed to load binary data: ${dataUrl}`);
          
          const arrayBuffer = await dataResponse.arrayBuffer();
          const float32Array = new Float32Array(arrayBuffer);
          
          // Compute min/max
          let min = Infinity, max = -Infinity;
          for (let i = 0; i < float32Array.length; i++) {
            if (float32Array[i] < min) min = float32Array[i];
            if (float32Array[i] > max) max = float32Array[i];
          }
          setScalarData({
            action: 'update',
            name: fieldData.name || selectedField,
            data: float32Array
          });
          
          setLoadedFieldName(fieldData.name || selectedField);
        } else if (fieldData.type === 'vector') {
        }
      } catch (error) {
        setLoadedFieldName(null);
      } finally {
        setIsLoadingField(false);
      }
    };

    loadField();
  }, [selectedField, viewerState.mesh.status]);
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Tool shortcuts (case-insensitive)
      const key = e.key.toLowerCase();
      
      if (key === 'f') {
        setActiveTool('filter');
      } else if (key === 'escape') {
        setHasSelection(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleClearSelection = () => {
    setHasSelection(false);
  };

  const handleClearField = () => {
    setScalarData({ action: 'clear' });
    setSelectedField('');
    setLoadedFieldName(null);
  };

  // Brush family change handler - activates picking for simplex brush
  const handleBrushFamilyChange = (family: BrushFamily) => {
    setBrushFamily(family);
    
    // Activate picking when simplex brush is selected
    if (family === 'simplex') {
      // Map simplexType to picking mode
      const modeMap: Record<SimplexType, 'vertex' | 'edge' | 'triangle'> = {
        vertex: 'vertex',
        edge: 'edge',
        face: 'triangle'
      };
      setPickingMode(modeMap[simplexType]);
    } else if (family === 'patch' && patchType === 'spectral') {
      // Activate vertex picking for spectral brush
      setPickingMode('vertex');
    } else {
      // Deactivate picking for other brushes
      setPickingMode(null);
    }
  };

  // Simplex type change handler - updates picking mode if simplex is active
  const handleSimplexTypeChange = (type: SimplexType) => {
    setSimplexType(type);
    
    // Update picking mode if simplex brush is active
    if (brushFamily === 'simplex') {
      const modeMap: Record<SimplexType, 'vertex' | 'edge' | 'triangle'> = {
        vertex: 'vertex',
        edge: 'edge',
        face: 'triangle'
      };
      setPickingMode(modeMap[type]);
    }
  };

  // Patch type change handler - updates picking mode if patch is active
  const handlePatchTypeChange = (type: PatchType) => {
    setPatchType(type);
    
    // Update picking mode if patch brush is active and spectral is selected
    if (brushFamily === 'patch' && type === 'spectral') {
      setPickingMode('vertex');
    } else if (brushFamily === 'patch') {
      // Deactivate picking for other patch types
      setPickingMode(null);
    }
  };

  // Picking callbacks
  const handleVertexPick = (vertexIdx: number, position: { x: number; y: number; z: number }) => {
    setSelectedVertexIndex(vertexIdx);
    setSelectedVertexPosition(position);
  };

  // Heat kernel computation effect - runs when vertex picked with spectral brush
  useEffect(() => {
    const computeHeatKernel = async () => {
      if (
        selectedVertexIndex === undefined ||
        !bctData ||
        !heatKernelRef.current ||
        brushFamily !== 'patch' ||
        patchType !== 'spectral' ||
        viewerState.mesh.status !== 'loaded'
      ) {
        return;
      }

      try {
        setIsComputingHeat(true);
        // Use brush patch settings for tau and Kactive
        const tau = brushPatch.heatT;
        const Kactive = Math.min(Math.round(brushPatch.heatK), bctData.K);

        // Update TSL uniforms
        heatKernelRef.current.setParams({
          selectedVertex: selectedVertexIndex,
          tau,
          Kactive
        });

        // Get compute nodes
        const { coeffCompute, fieldCompute } = heatKernelRef.current.getComputeNodes();

        // Execute compute passes on GPU
        const renderer = getRenderer();
        if (!renderer) {
          throw new Error('Renderer not available');
        }

        // Pass 1: Compute coefficients
        renderer.compute(coeffCompute);
        
        // Pass 2: Reconstruct field
        renderer.compute(fieldCompute);
        // Get heat field storage for visualization
        const heatFieldStorage = heatKernelRef.current.getHeatFieldStorage();
        
        // TODO: Bind heatFieldStorage to mesh material's color attribute
        // For now, we still need readback to use existing setScalarData
        // This will be eliminated in the next phase when we bind directly to material
      } catch (error) {
      } finally {
        setIsComputingHeat(false);
      }
    };

    computeHeatKernel();
  }, [selectedVertexIndex, brushPatch.heatT, brushPatch.heatK, bctData, brushFamily, patchType, viewerState.mesh.status]);

  const handleEdgePick = (edge: [number, number]) => {
    // TODO: Handle edge selection
  };

  const handleTrianglePick = (faceIdx: number) => {
    // TODO: Handle triangle selection
  };

  return (
    <ViewerLayout
      left={
        <LeftSidebar
          activeTool={activeTool}
          viewerState={viewerState}
          selectedField={selectedField}
          onFieldChange={setSelectedField}
          filterFamily={filterFamily}
          filterHeat={filterHeat}
          filterWavelet={filterWavelet}
          filterDiffusion={filterDiffusion}
          filterWave={filterWave}
          filterDampedWave={filterDampedWave}
          filterDynamic={filterDynamic}
          onFilterFamilyChange={setFilterFamily}
          onFilterHeatChange={setFilterHeat}
          onFilterWaveletChange={setFilterWavelet}
          onFilterDiffusionChange={setFilterDiffusion}
          onFilterWaveChange={setFilterWave}
          onFilterDampedWaveChange={setFilterDampedWave}
          onFilterDynamicChange={setFilterDynamic}
          onBCTLoaded={handleBCTLoaded}
          bctEigenvalues={bctData?.lambda}
          bctEigenmodeCount={bctData?.K}
          selectedEigenmode={selectedEigenmode}
          onEigenmodeSelected={handleEigenmodeSelected}
        />
      }
      main={
        <div className="relative w-full h-full">
          {/* Canvas fills entire space */}
          <ViewerCanvas 
            onStateChange={handleViewerStateChange}
            pickingMode={pickingMode}
            onVertexPick={handleVertexPick}
            onEdgePick={handleEdgePick}
            onTrianglePick={handleTrianglePick}
          />
          {/* Controls overlaid on canvas */}
          <ViewerControls
            hasSelection={hasSelection}
            onClearSelection={handleClearSelection}
            loadedFieldName={loadedFieldName}
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
      right={<ChartViewerPanel />}
      bottom={
        <div className="flex flex-col">
          {/* Time Series Controls - compact playback controls */}
          <TimeSeriesControls 
            className="rounded-none" 
            onStateChange={setTimeSeriesState}
            maxTime={maxDiffusionTime}
          />
          {/* Status Readout */}
          <StatusReadout
            cursorPosition={selectedVertexPosition}
            vertexIndex={selectedVertexIndex}
            fps={60}
            viewerState={viewerState}
          />
        </div>
      }
    />
  );
}

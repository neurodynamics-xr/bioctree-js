// Tool types for Photoshop-lite mesh viewer

export type ToolType = 'select' | 'brush' | 'filter';

// Sub-tool types
export type SelectMode = 'vertex' | 'edge' | 'face';
export type BrushFamily = 'none' | 'patch' | 'path' | 'time' | 'simplex';
export type SimplexType = 'vertex' | 'edge' | 'face';
export type PatchType = 'spectral' | 'graph' | 'geodesic';
export type FilterFamily = 'heat' | 'wavelet' | 'diffusion' | 'wave' | 'damped-wave' | 'dynamic';

// Brush kernel types
export type PatchKernel = 'nearest' | 'heat' | 'gaussian';

// Tool state interfaces
export interface SelectState {
  mode: SelectMode;
}

export interface BrushPatchState {
  kernel: PatchKernel;
  size: number;
  // Nearest kernel params
  depthK: number;
  // Heat kernel params
  heatT: number;
  heatK: number;
  // Gaussian kernel params
  sigma: number;
  // Common
  previewFootprint: boolean;
}

export interface BrushPathState {
  // Placeholder for path brush
  stepSize: number;
}

export interface BrushTimeState {
  // Placeholder for time brush
  timeWindow: number;
}

export interface BrushSimplexState {
  simplexType: SimplexType;
}

export interface BrushState {
  family: BrushFamily;
  patch: BrushPatchState;
  path: BrushPathState;
  time: BrushTimeState;
  simplex: BrushSimplexState;
}

// Filter state interfaces
export interface FilterHeatState {
  diffusivity: number;
  timeStep: number;
  iterations: number;
}

export interface FilterWaveletState {
  level: number;
  threshold: number;
  waveletType: 'haar' | 'db4' | 'sym4';
}

export interface FilterDiffusionState {
  lambda: number;
  iterations: number;
  preserveFeatures: boolean;
}

export interface FilterWaveState {
  frequency: number;
  amplitude: number;
  waveSpeed: number;
}

export interface FilterDampedWaveState {
  frequency: number;
  amplitude: number;
  dampingFactor: number;
  waveSpeed: number;
}

export interface FilterDynamicState {
  timeWindow: number;
  adaptiveRate: number;
}

export interface FilterState {
  family: FilterFamily;
  heat: FilterHeatState;
  wavelet: FilterWaveletState;
  diffusion: FilterDiffusionState;
  wave: FilterWaveState;
  dampedWave: FilterDampedWaveState;
  dynamic: FilterDynamicState;
}

// Complete tool state
export interface ToolState {
  activeTool: ToolType;
  select: SelectState;
  brush: BrushState;
  filter: FilterState;
}
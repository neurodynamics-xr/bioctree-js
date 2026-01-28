/**
 * Core filter system types for spectral filtering
 */

/**
 * Parameter definition for filter kernels
 */
export interface FilterParameter {
  name: string;
  default: number;
  min: number;
  max: number;
  step?: number;
  description: string;
}

/**
 * Core filter kernel interface - defines a mathematical filter function
 * operating on eigenvalues
 */
export interface FilterKernel {
  /** Unique identifier for the kernel */
  name: string;
  
  /** Human-readable display name */
  displayName: string;
  
  /** Brief description of the kernel's behavior */
  description: string;
  
  /**
   * Evaluate kernel at a single eigenvalue
   * @param lambda Eigenvalue
   * @param params Parameter values by name
   * @returns Filter weight in [0, 1] (or unbounded for some kernels)
   */
  evaluate(lambda: number, params: Record<string, number>): number;
  
  /** Parameter definitions for UI and validation */
  parameters: FilterParameter[];
  
  /** Optional: Get effective bandwidth of the filter */
  bandwidth?(params: Record<string, number>): number;
  
  /** Optional: Get support interval [min, max] where kernel is non-negligible */
  support?(params: Record<string, number>): [number, number];
}

/**
 * GPU-friendly filter kernel representation
 */
export interface GPUFilterKernel {
  name: string;
  
  /** Pre-evaluated kernel weights for each eigenmode */
  weights: Float32Array;
  
  /** Number of active eigenmodes (where weight > threshold) */
  Kactive: number;
  
  /** Original parameters used to generate weights */
  params: Record<string, number>;
}

/**
 * Visualization data for plotting filter kernels
 */
export interface FilterVisualizationData {
  /** Eigenvalue sample points */
  lambdas: number[];
  
  /** Kernel weights at each sample point */
  weights: number[];
  
  /** Optional: metadata for rendering */
  metadata?: {
    bandwidth?: number;
    support?: [number, number];
    effectiveRank?: number;
  };
}

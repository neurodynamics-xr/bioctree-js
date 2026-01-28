/**
 * Type definitions for spectral filter operators.
 * These types define the compute graph and parameter update interface.
 */

import type { GpuBasisHandle, GpuFieldHandle } from './gpuResources';

/**
 * A single compute pass (dispatch-ready compute node).
 */
export interface ComputePass {
  /** Unique identifier for debugging */
  readonly id: string;
  
  /** The compute node (from TSL Fn().compute(...)) */
  readonly node: any; // THREE.Node or similar
  
  /** Number of work items to dispatch */
  readonly dispatchCount: number;
}

/**
 * Parameters for spectral impulse kernel (point-source filtering).
 */
export interface ImpulseKernelParams {
  /** Kernel type identifier */
  kernelType: string;
  
  /** Source vertex index */
  sourceVertex: number;
  
  /** Kernel-specific parameters (e.g., tau for heat, sigma for Gaussian) */
  params: Record<string, number>;
}

/**
 * Output from a spectral filter operator.
 */
export interface OperatorOutput {
  /** Filtered scalar field on vertices */
  field: GpuFieldHandle;
  
  /** Optional: spectral coefficients (for debugging/analysis) */
  coefficients?: GpuFieldHandle;
  
  /** Number of active modes used (for adaptive truncation) */
  Kactive?: number;
}

/**
 * A spectral filter operator that transforms input → output via compute passes.
 */
export interface SpectralOperator {
  /** Human-readable name for debugging */
  readonly name: string;
  
  /** Spectral basis this operator uses */
  readonly basis: GpuBasisHandle;
  
  /** Current operator output */
  readonly output: OperatorOutput;
  
  /**
   * Update operator parameters (lightweight, no reallocation).
   * Returns true if compute passes need to be re-dispatched.
   */
  updateParams(params: Partial<ImpulseKernelParams>): boolean;
  
  /**
   * Get the compute passes to dispatch (may be cached between param updates).
   */
  getComputePasses(): ComputePass[];
  
  /**
   * Dispose operator-owned resources (does NOT dispose the basis).
   */
  dispose(): void;
}

/**
 * Factory function signature for creating spectral operators.
 */
export type SpectralOperatorFactory = (
  basis: GpuBasisHandle,
  params: ImpulseKernelParams
) => SpectralOperator;

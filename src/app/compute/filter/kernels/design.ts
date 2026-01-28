/**
 * Kernel parameter exploration utilities
 * 
 * Provides CPU-based tools for exploring filter kernel parameters
 * and visualizing their effects on the eigenvalue spectrum.
 * 
 * This is for static kernel visualization and parameter tuning UI only.
 * For GPU-accelerated filtering, use ../design.ts (FilterDesign).
 */

import type {
  FilterKernel,
  GPUFilterKernel,
  FilterVisualizationData,
} from '../types';

/**
 * Filter parameters class - lightweight CPU-based parameter container
 * Use for kernel exploration UI (sliders, plots, etc.)
 */
export class FilterParameters {
  kernel: FilterKernel;
  params: Map<string, number>;

  constructor(kernel: FilterKernel, params?: Record<string, number>) {
    this.kernel = kernel;
    this.params = new Map();

    // Initialize with defaults or provided params
    for (const param of kernel.parameters) {
      const value = params?.[param.name] ?? param.default;
      this.params.set(param.name, value);
    }
  }

  /**
   * Evaluate kernel at a single eigenvalue
   */
  evaluate(lambda: number): number {
    const params = Object.fromEntries(this.params);
    return this.kernel.evaluate(lambda, params);
  }

  /**
   * Evaluate kernel over an array of eigenvalues
   * Useful for visualization or pre-computation
   */
  evaluateSpectrum(lambdas: Float32Array): Float32Array {
    const weights = new Float32Array(lambdas.length);
    const params = Object.fromEntries(this.params);

    for (let i = 0; i < lambdas.length; i++) {
      weights[i] = this.kernel.evaluate(lambdas[i], params);
    }

    return weights;
  }

  /**
   * Create visualization data for plotting
   * Generates evenly-spaced samples for smooth curves
   */
  createVisualizationData(
    lambdaRange: [number, number],
    numSamples: number = 256
  ): FilterVisualizationData {
    const [minLambda, maxLambda] = lambdaRange;
    const step = (maxLambda - minLambda) / (numSamples - 1);

    const lambdas: number[] = [];
    const weights: number[] = [];
    const params = Object.fromEntries(this.params);

    for (let i = 0; i < numSamples; i++) {
      const lambda = minLambda + i * step;
      lambdas.push(lambda);
      weights.push(this.kernel.evaluate(lambda, params));
    }

    // Compute metadata if available
    const metadata: FilterVisualizationData['metadata'] = {};
    if (this.kernel.bandwidth) {
      metadata.bandwidth = this.kernel.bandwidth(params);
    }
    if (this.kernel.support) {
      metadata.support = this.kernel.support(params);
    }

    return { lambdas, weights, metadata };
  }

  /**
   * Export to GPU-friendly format
   * Pre-computes filter weights for all eigenmodes
   */
  toGPUKernel(lambdas: Float32Array, activeThreshold = 0.01): GPUFilterKernel {
    const weights = this.evaluateSpectrum(lambdas);

    // Count active eigenmodes (where weight > threshold)
    let Kactive = weights.length;
    for (let i = weights.length - 1; i >= 0; i--) {
      if (weights[i] > activeThreshold) {
        Kactive = i + 1;
        break;
      }
    }

    return {
      name: this.kernel.name,
      weights,
      Kactive,
      params: Object.fromEntries(this.params),
    };
  }

  /**
   * Update a parameter value
   */
  setParameter(name: string, value: number): void {
    // Validate parameter exists
    const paramDef = this.kernel.parameters.find((p) => p.name === name);
    if (!paramDef) {
      throw new Error(`Unknown parameter: ${name}`);
    }

    // Clamp to valid range
    const clampedValue = Math.max(
      paramDef.min,
      Math.min(paramDef.max, value)
    );

    this.params.set(name, clampedValue);
  }

  /**
   * Get current parameter value
   */
  getParameter(name: string): number | undefined {
    return this.params.get(name);
  }

  /**
   * Get all parameters as object
   */
  getParameters(): Record<string, number> {
    return Object.fromEntries(this.params);
  }

  /**
   * Reset all parameters to defaults
   */
  resetParameters(): void {
    for (const param of this.kernel.parameters) {
      this.params.set(param.name, param.default);
    }
  }

  /**
   * Clone this parameter set
   */
  clone(): FilterParameters {
    return new FilterParameters(this.kernel, this.getParameters());
  }
}

/**
 * Compute effective rank of filter (sum of squared weights)
 */
export function computeEffectiveRank(weights: Float32Array): number {
  let sumSquared = 0;
  let sum = 0;

  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];
    sumSquared += w * w;
    sum += w;
  }

  // Effective rank = (sum of weights)^2 / (sum of squared weights)
  // This measures how many modes are effectively used
  return sum > 0 ? (sum * sum) / sumSquared : 0;
}

/**
 * Heat kernel filter: exp(-λ * tau)
 * 
 * Classic heat diffusion kernel that exponentially decays high-frequency modes.
 * Parameter tau controls diffusion time - larger tau = more smoothing.
 * 
 * Properties:
 * - Low-pass filter (attenuates high frequencies)
 * - Scale-space generation (varying tau creates scale pyramid)
 * - Used for geodesic distance computation, smoothing, feature detection
 */

import type { FilterKernel, FilterParameter } from '../legacyTypes';

/**
 * Heat kernel parameters
 */
export interface HeatKernelParams {
  tau: number; // Diffusion time (larger = more smoothing)
}

/**
 * Heat kernel filter definition
 */
export const heatKernel: FilterKernel = {
  name: 'heat',
  displayName: 'Heat Diffusion',
  description: 'Exponential decay filter: exp(-λ * tau). Low-pass filter for smoothing and diffusion.',
  
  parameters: [
    {
      name: 'tau',
      default: 0.01,
      min: 0.0001,
      max: 1.0,
      step: 0.0001,
      description: 'Diffusion time (larger values = more smoothing)',
    },
  ] as FilterParameter[],
  
  /**
   * Evaluate heat kernel at eigenvalue λ
   */
  evaluate(lambda: number, params: Record<string, number>): number {
    const tau = params.tau ?? 0.01;
    
    // Heat kernel: exp(-λ * tau)
    return Math.exp(-lambda * tau);
  },
  
  /**
   * Get effective bandwidth (frequency where kernel decays to e^-1 ≈ 0.368)
   */
  bandwidth(params: Record<string, number>): number {
    const tau = params.tau ?? 0.01;
    // At λ = 1/tau, kernel = exp(-1) ≈ 0.368
    return 1 / tau;
  },
  
  /**
   * Get support interval (where kernel > 0.01)
   * For heat kernel, this is approximately [0, -ln(0.01) / tau]
   */
  support(params: Record<string, number>): [number, number] {
    const tau = params.tau ?? 0.01;
    const threshold = 0.01;
    const maxLambda = -Math.log(threshold) / tau; // ≈ 4.6 / tau
    return [0, maxLambda];
  },
};

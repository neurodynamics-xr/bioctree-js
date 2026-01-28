/**
 * useBCTSpectral Hook
 * 
 * React hook for loading BCT spectral data with state management
 */

import { useState, useCallback } from 'react';
import { loadBCTSpectral } from '@/app/io';
import type { BCTSpectralData, LoadOptions } from '@/app/io';

export interface BCTSpectralLoadState {
  loading: boolean;
  error: Error | null;
  data: BCTSpectralData | null;
  warnings?: string[];
}

export interface UseBCTSpectralReturn {
  state: BCTSpectralLoadState;
  loadSpectral: (manifestPath: string, binaryPath?: string) => Promise<void>;
  reset: () => void;
}

/**
 * Hook for loading BCT spectral data with React state management
 * 
 * @example
 * const { state, loadSpectral } = useBCTSpectral();
 * 
 * const handleLoad = async () => {
 *   await loadSpectral('/data/bct/bunny_spectral.json');
 * };
 * 
 * if (state.loading) return <div>Loading spectral data...</div>;
 * if (state.error) return <div>Error: {state.error.message}</div>;
 * if (state.data) {
 *   // Use state.data.lambda, state.data.psi, state.data.gradPsi
 * }
 */
export function useBCTSpectral(): UseBCTSpectralReturn {
  const [state, setState] = useState<BCTSpectralLoadState>({
    loading: false,
    error: null,
    data: null,
  });

  const loadSpectral = useCallback(async (
    manifestPath: string,
    binaryPath?: string
  ) => {
    setState({
      loading: true,
      error: null,
      data: null,
    });

    const options: LoadOptions = {
      onError: (error) => {
        setState({
          loading: false,
          error,
          data: null,
        });
      },
      validate: true,
    };

    try {
      const result = await loadBCTSpectral(manifestPath, binaryPath, options);
      setState({
        loading: false,
        error: null,
        data: result.data,
        warnings: result.warnings,
      });
    } catch (error) {
      setState({
        loading: false,
        error: error as Error,
        data: null,
      });
    }
  }, []);

  const reset = useCallback(() => {
    setState({
      loading: false,
      error: null,
      data: null,
    });
  }, []);

  return { state, loadSpectral, reset };
}

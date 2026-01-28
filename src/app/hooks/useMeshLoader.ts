/**
 * useMeshLoader Hook
 * 
 * React hook for loading manifold geometry with state management
 */

import { useState, useCallback } from 'react';
import { loadManifold } from '@/app/io';
import type { ManifoldData, ManifoldFormat, LoadOptions } from '@/app/io';

export interface MeshLoadState {
  loading: boolean;
  error: Error | null;
  data: ManifoldData | null;
  progress: number;
}

export interface UseMeshLoaderReturn {
  state: MeshLoadState;
  loadMesh: (url: string, format?: ManifoldFormat) => Promise<void>;
  reset: () => void;
}

/**
 * Hook for loading mesh data with React state management
 * 
 * @example
 * const { state, loadMesh } = useMeshLoader();
 * 
 * const handleLoad = async () => {
 *   await loadMesh('/data/manifolds/bunny.glb');
 * };
 * 
 * if (state.loading) return <div>Loading...</div>;
 * if (state.error) return <div>Error: {state.error.message}</div>;
 * if (state.data) return <Viewer mesh={state.data} />;
 */
export function useMeshLoader(): UseMeshLoaderReturn {
  const [state, setState] = useState<MeshLoadState>({
    loading: false,
    error: null,
    data: null,
    progress: 0,
  });

  const loadMesh = useCallback(async (url: string, format?: ManifoldFormat) => {
    setState({
      loading: true,
      error: null,
      data: null,
      progress: 0,
    });

    const options: LoadOptions = {
      onProgress: (progress) => {
        setState((prev) => ({
          ...prev,
          progress: progress.percentage,
        }));
      },
      onError: (error) => {
        setState({
          loading: false,
          error,
          data: null,
          progress: 0,
        });
      },
    };

    try {
      const result = await loadManifold(url, format, options);
      setState({
        loading: false,
        error: null,
        data: result.data,
        progress: 100,
      });
    } catch (error) {
      setState({
        loading: false,
        error: error as Error,
        data: null,
        progress: 0,
      });
    }
  }, []);

  const reset = useCallback(() => {
    setState({
      loading: false,
      error: null,
      data: null,
      progress: 0,
    });
  }, []);

  return { state, loadMesh, reset };
}

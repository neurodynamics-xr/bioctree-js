import { useState, useEffect } from 'react';

export interface ViewerState {
  appState: 'idle' | 'loading' | 'ready' | 'computing' | 'error' | 'canceling';
  mesh: {
    status: 'none' | 'loading' | 'loaded' | 'failed';
    vertexCount: number;
    faceCount: number;
    bounds: { radius: number; center: [number, number, number] } | null;
  };
  data: {
    status: 'none' | 'loading' | 'ready' | 'failed';
    type: 'scalar' | 'vector' | null;
    count: number;
    range: [number, number];
  };
}

export const defaultViewerState: ViewerState = {
  appState: 'idle',
  mesh: {
    status: 'none',
    vertexCount: 0,
    faceCount: 0,
    bounds: null,
  },
  data: {
    status: 'none',
    type: null,
    count: 0,
    range: [0, 1],
  },
};

export function useViewerState() {
  const [viewerState, setViewerState] = useState<ViewerState>(defaultViewerState);

  return {
    viewerState,
    setViewerState,
  };
}

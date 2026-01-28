import React from 'react';
import { ViewerState } from '../hooks/useViewerState';

interface StatusReadoutProps {
  cursorPosition?: { x: number; y: number; z: number };
  vertexIndex?: number;
  fps?: number;
  viewerState?: ViewerState;
}

export function StatusReadout({
  cursorPosition = { x: 0, y: 0, z: 0 },
  vertexIndex,
  fps = 60,
  viewerState,
}: StatusReadoutProps) {
  return (
    <div className="flex items-center gap-6 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700 px-4 py-1.5 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="text-gray-500 dark:text-gray-400">XYZ:</span>
        <span className="font-mono">
          {cursorPosition.x.toFixed(2)}, {cursorPosition.y.toFixed(2)},{' '}
          {cursorPosition.z.toFixed(2)} mm
        </span>
      </div>
      
      {vertexIndex !== undefined && (
        <>
          <div className="w-px h-3 bg-gray-300 dark:bg-gray-600" />
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 dark:text-gray-400">Vertex:</span>
            <span className="font-mono">{vertexIndex}</span>
          </div>
        </>
      )}

      {/* Mesh Statistics */}
      {viewerState?.mesh.status === 'loaded' && viewerState.mesh.vertexCount > 0 && (
        <>
          <div className="w-px h-3 bg-gray-300 dark:bg-gray-600" />
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 dark:text-gray-400">Mesh:</span>
            <span className="font-mono text-blue-400">
              {viewerState.mesh.vertexCount.toLocaleString()} vertices • {viewerState.mesh.faceCount.toLocaleString()} faces
            </span>
          </div>
        </>
      )}

      {/* Field Status Display */}
      {viewerState?.data.status !== 'none' && viewerState?.data.status && viewerState?.data.status === 'loaded' && (
        <>
          <div className="w-px h-3 bg-gray-300 dark:bg-gray-600" />
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 dark:text-gray-400">Field:</span>
            <span className="font-mono text-green-400 capitalize">{viewerState.data.type || 'scalar'}</span>
          </div>
        </>
      )}

      {viewerState?.data.status === 'loaded' && viewerState?.data.range && Array.isArray(viewerState.data.range) && viewerState.data.range.length === 2 && (
        <>
          <div className="w-px h-3 bg-gray-300 dark:bg-gray-600" />
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 dark:text-gray-400">Range:</span>
            <span className="font-mono">
              [{Number(viewerState.data.range[0]).toFixed(3)}, {Number(viewerState.data.range[1]).toFixed(3)}]
            </span>
          </div>
        </>
      )}
      
      <div className="ml-auto text-gray-500 dark:text-gray-400">
        {fps} FPS
      </div>
    </div>
  );
}
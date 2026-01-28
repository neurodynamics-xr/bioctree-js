/**
 * IOPanel - Data Input/Output Panel
 * 
 * Centralized panel for loading all types of data:
 * - Manifolds (GLB/GLTF/OBJ/JSON geometry)
 * - Fields (scalar/vector field data)
 * - BCT packages (spectral eigenmodes, operators)
 * 
 * Replaces scattered IO functionality from ManifoldPanel and FieldsPanel
 */

import { useState } from 'react';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { loadManifoldFromZarr, listZarrGroups, loadEigenmodesFromZarr } from '@/app/io/loaders/zarr';
import { Manifold, ManifoldMetadata, ManifoldCore, ManifoldTopology, ManifoldEigenmodes } from '@/app/manifold/Manifold';
import { setManifold, getManifold } from '@/app/state/manifold';

interface IOPanelProps {
  onBCTLoaded?: () => void;
}

export function IOPanel({ onBCTLoaded }: IOPanelProps) {
  // Zarr loading state
  const [selectedZarr, setSelectedZarr] = useState<string>('');
  const [isLoadingZarr, setIsLoadingZarr] = useState(false);
  
  // Zarr inspector state
  const [currentZarrPath, setCurrentZarrPath] = useState<string>('');
  const [zarrGroups, setZarrGroups] = useState<Array<{ path: string; attrs: Record<string, any> }>>([]);
  const [loadedGroups, setLoadedGroups] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [loadingGroup, setLoadingGroup] = useState<string | null>(null);

  // Auto-discover Zarr packages (directories in data/)
  // @ts-ignore - Vite-specific import.meta.glob not in TypeScript types
  const zarrModules = import.meta.glob('/src/app/data/*.zarr/**', {
    eager: true,
  });

  // Extract unique .zarr directory names
  const availableZarr = Array.from(
    new Set(
      Object.keys(zarrModules)
        .map(path => {
          const match = path.match(/\/src\/app\/data\/(.*?)\.zarr\//);
          return match ? match[1] : null;
        })
        .filter(Boolean)
    )
  )
    .map(name => ({
      value: name as string,
      label: name as string,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Zarr loading handler
  const handleLoadZarr = async () => {
    if (!selectedZarr) return;
    
    setIsLoadingZarr(true);
    try {
      // Construct path to zarr directory
      const zarrPath = `src/app/data/${selectedZarr}.zarr`;
      setCurrentZarrPath(zarrPath);
      
      // Load manifold using new structured loader (core mesh only)
      const zarrManifold = await loadManifoldFromZarr(zarrPath, {
        loadEdges: true,
        loadEigenmodes: false, // Don't auto-load, let user choose
        validateIndices: true,
      });
      // Create Manifold object (core only - no eigenmodes yet)
      const nV = zarrManifold.vertices.length / 3;
      const nF = zarrManifold.faces.length / 3;
      
      const metadata: ManifoldMetadata = {
        id: zarrManifold.metadata.ID || selectedZarr,
        name: zarrManifold.metadata.Name || selectedZarr,
        createdAt: Date.now(),
        source: zarrPath,
      };
      
      const core: ManifoldCore = {
        vertices: zarrManifold.vertices as Float32Array,
        faces: zarrManifold.faces,
        nV,
        nF,
      };
      
      const topology: ManifoldTopology = zarrManifold.edges ? {
        edges: zarrManifold.edges,
        nE: zarrManifold.edges.length / 2,
      } : {};
      
      const manifold = new Manifold(metadata, core, {}, topology);
      
      // Update global manifold state
      setManifold(manifold);
      
      // Discover all available groups in the zarr package
      const groups = await listZarrGroups(zarrPath);
      setZarrGroups(groups);
      setLoadedGroups(new Set(['manifold'])); // Core manifold is loaded
      // Notify parent component
      if (onBCTLoaded) {
        onBCTLoaded();
      }
      
    } catch (error) {
      alert(`Failed to load Zarr package: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoadingZarr(false);
    }
  };

  // Load a specific group (eigenmodes, geometry, topology, etc.)
  const handleLoadGroup = async (groupPath: string) => {
    if (!currentZarrPath) {
      alert('No zarr package loaded');
      return;
    }

    setLoadingGroup(groupPath);
    try {
      if (groupPath === 'manifold/eigenmodes') {
        // Load eigenmodes and update manifold
        const eigenmodesData = await loadEigenmodesFromZarr(currentZarrPath);
        // Get current manifold and create new one with eigenmodes
        const currentManifold = getManifold();
        if (!currentManifold) {
          alert('No manifold loaded');
          return;
        }

        // Convert to ManifoldEigenmodes format
        const eigenmodes: ManifoldEigenmodes = {
          eigenvalues: eigenmodesData.eigenvalues instanceof Float64Array
            ? new Float32Array(eigenmodesData.eigenvalues)
            : eigenmodesData.eigenvalues as Float32Array,
          eigenfunctions: eigenmodesData.eigenvectors instanceof Float64Array
            ? new Float32Array(eigenmodesData.eigenvectors)
            : eigenmodesData.eigenvectors as Float32Array,
          K: eigenmodesData.metadata.numModes,
        };

        // Create new manifold with eigenmodes
        const updatedManifold = new Manifold(
          currentManifold.metadata,
          currentManifold.core,
          currentManifold.geometry,
          currentManifold.topology,
          eigenmodes
        );

        setManifold(updatedManifold);
        setLoadedGroups(prev => new Set(prev).add(groupPath));
      } else {
        // Placeholder for other group types
        alert(`Loading ${groupPath} - not implemented yet`);
      }
    } catch (error) {
      alert(`Failed to load ${groupPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoadingGroup(null);
    }
  };

  // Toggle group expansion in inspector
  const toggleGroupExpansion = (groupPath: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupPath)) {
        next.delete(groupPath);
      } else {
        next.add(groupPath);
      }
      return next;
    });
  };

  // Format attribute value for display
  const formatAttrValue = (value: any): string => {
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  return (
    <div className="w-full space-y-3">
      {/* Zarr Package Selector */}
      <div className="space-y-2">
        <Label htmlFor="zarr-select" className="text-xs text-gray-300">
          Zarr Package
        </Label>
        <Select value={selectedZarr} onValueChange={setSelectedZarr}>
          <SelectTrigger id="zarr-select" className="h-8 text-xs">
            <SelectValue placeholder="Choose a package..." />
          </SelectTrigger>
          <SelectContent>
            {availableZarr.map((zarr) => (
              <SelectItem key={zarr.value} value={zarr.value} className="text-xs">
                {zarr.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        onClick={handleLoadZarr}
        disabled={!selectedZarr || isLoadingZarr}
        className="w-full h-8 text-xs"
      >
        {isLoadingZarr ? 'Loading...' : 'Load Package'}
      </Button>

      {/* Zarr Groups Inspector */}
      {zarrGroups.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-gray-700">
          <Label className="text-xs text-gray-300 font-semibold">
            Available Groups ({zarrGroups.length})
          </Label>
          
          <div className="space-y-1 max-h-[600px] overflow-y-auto">
            {zarrGroups.map((group) => {
              const isExpanded = expandedGroups.has(group.path);
              const isLoaded = loadedGroups.has(group.path);
              const groupName = group.path.split('/').pop() || group.path;
              const depth = group.path.split('/').length - 1;
              
              return (
                <div
                  key={group.path}
                  className="border border-gray-700 rounded bg-gray-800/50 p-2"
                  style={{ marginLeft: `${depth * 8}px` }}
                >
                  {/* Group Header */}
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => toggleGroupExpansion(group.path)}
                      className="flex-1 flex items-center gap-1 text-left hover:bg-gray-700/50 rounded px-1"
                    >
                      <span className="text-xs text-gray-400">
                        {isExpanded ? '▼' : '▶'}
                      </span>
                      <span className="text-xs font-mono text-gray-200">
                        {groupName}
                      </span>
                      {isLoaded && (
                        <span className="text-[10px] text-green-400 ml-1">✓</span>
                      )}
                    </button>
                    
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px]"
                      disabled={isLoaded || loadingGroup === group.path}
                      onClick={() => handleLoadGroup(group.path)}
                    >
                      {loadingGroup === group.path ? 'Loading...' : isLoaded ? 'Loaded' : 'Load'}
                    </Button>
                  </div>
                  
                  {/* Group Attributes (expanded) */}
                  {isExpanded && Object.keys(group.attrs).length > 0 && (
                    <div className="mt-2 pl-4 space-y-1">
                      {Object.entries(group.attrs).map(([key, value]) => (
                        <div key={key} className="text-[10px] font-mono">
                          <span className="text-gray-400">{key}:</span>{' '}
                          <span className="text-gray-300">
                            {typeof value === 'string' && value.length > 50
                              ? `${value.substring(0, 50)}...`
                              : formatAttrValue(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


import React, { useState, useEffect } from 'react';
import {
  Filter,
  BrainCircuit,
  Activity,
  ChevronsLeft,
  ChevronsRight,
  FileInput,
} from 'lucide-react';
import { Button } from './ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import { DockPanel } from './DockPanel';
import { IOPanel } from './panels/IOPanel';
import { FiltersPanel } from './panels/FiltersPanel';
import { FieldsPanel } from './panels/FieldsPanel';
import { ManifoldPanel } from './panels/ManifoldPanel';
import {
  ToolType,
  FilterFamily,
  FilterHeatState,
  FilterWaveletState,
  FilterDiffusionState,
  FilterWaveState,
  FilterDampedWaveState,
  FilterDynamicState,
} from '../types/tools';
import { ViewerState } from '../hooks/useViewerState';
import { cn } from './ui/utils';
import type { BCTSpectralData } from '../io/loaders/types';

type PanelId = 'io' | 'manifold' | 'fields' | 'filters';

interface LeftSidebarProps {
  activeTool?: ToolType;
  filterFamily?: FilterFamily;
  filterHeat?: FilterHeatState;
  filterWavelet?: FilterWaveletState;
  filterDiffusion?: FilterDiffusionState;
  filterWave?: FilterWaveState;
  filterDampedWave?: FilterDampedWaveState;
  filterDynamic?: FilterDynamicState;
  viewerState?: ViewerState;
  onFilterFamilyChange?: (family: FilterFamily) => void;
  onFilterHeatChange?: (state: FilterHeatState) => void;
  onFilterWaveletChange?: (state: FilterWaveletState) => void;
  onFilterDiffusionChange?: (state: FilterDiffusionState) => void;
  onFilterWaveChange?: (state: FilterWaveState) => void;
  onFilterDampedWaveChange?: (state: FilterDampedWaveState) => void;
  onFilterDynamicChange?: (state: FilterDynamicState) => void;
  onBCTLoaded?: (data: BCTSpectralData) => void;
  bctEigenvalues?: Float32Array;
  bctEigenmodeCount?: number;
  selectedEigenmode?: number | null;
  onEigenmodeSelected?: (modeIndex: number) => void;
}

interface PanelConfig {
  id: PanelId;
  title: string;
  icon: React.ReactNode;
  component: React.ReactNode;
}

export function LeftSidebar({
  activeTool: _activeTool,
  filterFamily,
  filterHeat,
  filterWavelet,
  filterDiffusion,
  filterWave,
  filterDampedWave,
  viewerState,
  filterDynamic,
  onFilterFamilyChange,
  onFilterHeatChange,
  onFilterWaveletChange,
  onFilterDiffusionChange,
  onFilterWaveChange,
  onFilterDampedWaveChange,
  onFilterDynamicChange,
  onBCTLoaded,
  bctEigenvalues,
  bctEigenmodeCount,
  selectedEigenmode,
  onEigenmodeSelected,
}: LeftSidebarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [openPanels, setOpenPanels] = useState(new Set<PanelId>(['io']));
  const [width, setWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);

  const panels: PanelConfig[] = [
    {
      id: 'io',
      title: 'IO',
      icon: <FileInput className="h-3.5 w-3.5" />,
      component: <IOPanel onBCTLoaded={onBCTLoaded} />,
    },
    {
      id: 'manifold',
      title: 'Manifold',
      icon: <BrainCircuit className="h-3.5 w-3.5" />,
      component: <ManifoldPanel onEigenmodeSelected={onEigenmodeSelected} />,
    },
    {
      id: 'fields',
      title: 'Fields',
      icon: <Activity className="h-3.5 w-3.5" />,
      component: <FieldsPanel />,
    },
    {
      id: 'filters',
      title: 'Filters',
      icon: <Filter className="h-3.5 w-3.5" />,
      component: (
        <FiltersPanel
          filterFamily={filterFamily}
          filterHeat={filterHeat}
          filterWavelet={filterWavelet}
          filterDiffusion={filterDiffusion}
          filterWave={filterWave}
          filterDampedWave={filterDampedWave}
          filterDynamic={filterDynamic}
          onFilterFamilyChange={onFilterFamilyChange}
          onFilterHeatChange={onFilterHeatChange}
          onFilterWaveletChange={onFilterWaveletChange}
          onFilterDiffusionChange={onFilterDiffusionChange}
          onFilterWaveChange={onFilterWaveChange}
          onFilterDampedWaveChange={onFilterDampedWaveChange}
          onFilterDynamicChange={onFilterDynamicChange}
        />
      ),
    },
  ];

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = e.clientX;
      setWidth(Math.max(260, Math.min(520, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  if (!isExpanded) {
    // Collapsed - show Photoshop-style toolbar with panel icons
    return (
      <div className="flex flex-col w-12 h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 py-2 px-1 gap-0.5">
        {/* Expand Button */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsExpanded(true)}
                className="h-8 w-8 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Expand sidebar"
              >
                <ChevronsRight className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Expand Sidebar</TooltipContent>
          </Tooltip>

          {/* Panel Icon Buttons with Popovers */}
          {panels.map(panel => (
            <Popover key={panel.id}>
              <PopoverTrigger asChild>
                <div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                        aria-label={panel.title}
                      >
                        {panel.icon}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{panel.title}</TooltipContent>
                  </Tooltip>
                </div>
              </PopoverTrigger>
              <PopoverContent
                side="right"
                align="start"
                className="w-80 p-0 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                sideOffset={8}
              >
                <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                  {panel.icon}
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {panel.title}
                  </h3>
                </div>
                <div className="p-3">
                  {panel.component}
                </div>
              </PopoverContent>
            </Popover>
          ))}
        </TooltipProvider>
      </div>
    );
  }

  // Expanded Mode
  return (
    <div className="relative flex h-full" style={{ width: `${width}px` }}>
      {/* Sidebar Content */}
      <div className="flex flex-col flex-1 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Collapse Button Header */}
        <div className="flex items-center justify-end py-1.5 px-2 border-b border-gray-200 dark:border-gray-700">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsExpanded(false)}
                  className="h-7 w-7 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                  aria-label="Collapse sidebar"
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Collapse Sidebar</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Panels */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {panels.map(panel => (
            <DockPanel
              key={panel.id}
              title={panel.title}
              icon={panel.icon}
              defaultOpen={openPanels.has(panel.id)}
              onToggle={(isOpen) => {
                if (isOpen) {
                  setOpenPanels((prev: Set<PanelId>) => new Set([...prev, panel.id]));
                } else {
                  setOpenPanels((prev: Set<PanelId>) => {
                    const newSet = new Set(prev);
                    newSet.delete(panel.id);
                    return newSet;
                  });
                }
              }}
            >
              {panel.component}
            </DockPanel>
          ))}
        </div>
      </div>

      {/* Resize Handle */}
      <div
        className={cn(
          'absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500/50 transition-colors z-10',
          isResizing && 'bg-blue-500'
        )}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
}
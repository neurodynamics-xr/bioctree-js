import React, { useState } from 'react';
import { Paintbrush, Spline, Clock, Dot, Slash, Triangle, Radar, Network, Route } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { cn } from './ui/utils';
import type { BrushFamily, SimplexType, PatchType } from '../types/tools';

interface BrushOptionCardProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}

function BrushOptionCard({ icon, label, onClick }: BrushOptionCardProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className="flex items-center justify-center w-12 h-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition-all shadow-sm hover:shadow-md"
            aria-label={label}
          >
            <div className="text-gray-700 dark:text-gray-300">
              {icon}
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <span>{label}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface BrushCardProps {
  activeBrushFamily: BrushFamily;
  onBrushFamilyChange: (family: BrushFamily) => void;
  simplexType: SimplexType;
  onSimplexTypeChange: (simplexType: SimplexType) => void;
  patchType: PatchType;
  onPatchTypeChange: (patchType: PatchType) => void;
}

export function BrushCard({ activeBrushFamily, onBrushFamilyChange, simplexType, onSimplexTypeChange, patchType, onPatchTypeChange }: BrushCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Map brush families to their icons
  const brushIcons = {
    none: <Paintbrush className="w-5 h-5 text-gray-700 dark:text-gray-300" />,
    patch: patchType === 'spectral'
      ? <Radar className="w-5 h-5 text-gray-700 dark:text-gray-300" />
      : patchType === 'graph'
      ? <Network className="w-5 h-5 text-gray-700 dark:text-gray-300" />
      : <Route className="w-5 h-5 text-gray-700 dark:text-gray-300" />,
    path: <Spline className="w-5 h-5 text-gray-700 dark:text-gray-300" />,
    time: <Clock className="w-5 h-5 text-gray-700 dark:text-gray-300" />,
    simplex: simplexType === 'vertex' 
      ? <Dot className="w-5 h-5 text-gray-700 dark:text-gray-300" />
      : simplexType === 'edge'
      ? <Slash className="w-5 h-5 text-gray-700 dark:text-gray-300" />
      : <Triangle className="w-5 h-5 text-gray-700 dark:text-gray-300" />,
  };

  // Get label for active brush family
  const getBrushLabel = () => {
    switch (activeBrushFamily) {
      case 'patch': 
        return patchType === 'spectral'
          ? 'Spectral'
          : patchType === 'graph'
          ? 'Graph'
          : 'Geodesic';
      case 'path': return 'Path Brush';
      case 'time': return 'Dynamic Brush';
      case 'simplex': 
        return simplexType === 'vertex' 
          ? 'Vertex'
          : simplexType === 'edge'
          ? 'Edge'
          : 'Face';
      default: return 'Brush';
    }
  };

  // Get simplex icon based on current type
  const getSimplexIcon = () => {
    switch (simplexType) {
      case 'vertex': return <Dot className="w-5 h-5" />;
      case 'edge': return <Slash className="w-5 h-5" />;
      case 'face': return <Triangle className="w-5 h-5" />;
    }
  };

  // Get simplex label based on current type
  const getSimplexLabel = () => {
    switch (simplexType) {
      case 'vertex': return 'Vertex';
      case 'edge': return 'Edge';
      case 'face': return 'Face';
    }
  };

  // Get patch icon based on current type
  const getPatchIcon = () => {
    switch (patchType) {
      case 'spectral': return <Radar className="w-5 h-5" />;
      case 'graph': return <Network className="w-5 h-5" />;
      case 'geodesic': return <Route className="w-5 h-5" />;
    }
  };

  // Get patch label based on current type
  const getPatchLabel = () => {
    switch (patchType) {
      case 'spectral': return 'Spectral';
      case 'graph': return 'Graph';
      case 'geodesic': return 'Geodesic';
    }
  };

  // Cycle through simplex types
  const handleSimplexClick = () => {
    // If simplex is not active, activate it
    if (activeBrushFamily !== 'simplex') {
      onBrushFamilyChange('simplex');
    } else {
      // If simplex is already active, cycle to next type
      const nextType: SimplexType = 
        simplexType === 'vertex' ? 'edge' 
        : simplexType === 'edge' ? 'face' 
        : 'vertex';
      onSimplexTypeChange(nextType);
    }
  };

  // Cycle through patch types
  const handlePatchClick = () => {
    // If patch is not active, activate it
    if (activeBrushFamily !== 'patch') {
      onBrushFamilyChange('patch');
    } else {
      // If patch is already active, cycle to next type
      const nextType: PatchType = 
        patchType === 'spectral' ? 'graph' 
        : patchType === 'graph' ? 'geodesic' 
        : 'spectral';
      onPatchTypeChange(nextType);
    }
  };

  return (
    <div
      className="flex items-center gap-2"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Main Brush Card with hover menu */}
      <div className="relative">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  "flex items-center justify-center w-12 h-12 bg-white dark:bg-gray-800 rounded-lg border-2 transition-all shadow-md hover:shadow-lg",
                  isHovered
                    ? "border-blue-500 dark:border-blue-500"
                    : "border-gray-200 dark:border-gray-700"
                )}
                aria-label={getBrushLabel()}
              >
                {brushIcons[activeBrushFamily]}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <span>{getBrushLabel()}</span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Hover menu - shown when hovered */}
        <div className={cn(
          'absolute left-full ml-2 bottom-0 flex gap-2 transition-opacity duration-200',
          isHovered ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}>
          <BrushOptionCard
            icon={getSimplexIcon()}
            label={getSimplexLabel()}
            onClick={handleSimplexClick}
          />
          <BrushOptionCard
            icon={getPatchIcon()}
            label={getPatchLabel()}
            onClick={handlePatchClick}
          />
          <BrushOptionCard
            icon={<Spline className="w-5 h-5" />}
            label="Path"
            onClick={() => onBrushFamilyChange('path')}
          />
          <BrushOptionCard
            icon={<Clock className="w-5 h-5" />}
            label="Dynamic"
            onClick={() => onBrushFamilyChange('time')}
          />
        </div>
      </div>
    </div>
  );
}
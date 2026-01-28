import React, { useState } from 'react';
import { Layers, TrendingUp, Wind, Repeat, MoreHorizontal } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { cn } from './ui/utils';

type LayerType = 'gradient' | 'divergence' | 'curl';

interface OperatorCardProps {
  icon: React.ReactNode;
  label: string;
  isSelected: boolean;
  onClick?: () => void;
}

function OperatorCard({ icon, label, isSelected, onClick }: OperatorCardProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={cn(
              "flex items-center justify-center w-12 h-12 bg-white dark:bg-gray-800 rounded-lg border transition-all shadow-sm hover:shadow-md",
              isSelected
                ? "border-blue-500 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-blue-500 dark:hover:border-blue-500"
            )}
            aria-label={label}
          >
            <div className={cn(
              "transition-colors",
              isSelected
                ? "text-blue-600 dark:text-blue-400"
                : "text-gray-700 dark:text-gray-300"
            )}>
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

export function LayersCard() {
  const [isHovered, setIsHovered] = useState(false);
  const [selectedLayers, setSelectedLayers] = useState<Set<LayerType>>(new Set());

  // Keep expanded if any layers are selected
  const isExpanded = isHovered || selectedLayers.size > 0;

  const toggleLayer = (layer: LayerType) => {
    setSelectedLayers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(layer)) {
        newSet.delete(layer);
      } else {
        newSet.add(layer);
      }
      return newSet;
    });
  };

  return (
    <div
      className="flex items-center gap-2"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Main Layers Card */}
      <div className="relative">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  "flex items-center justify-center w-12 h-12 bg-white dark:bg-gray-800 rounded-lg border-2 transition-all shadow-md hover:shadow-lg",
                  isExpanded
                    ? "border-blue-500 dark:border-blue-500"
                    : "border-gray-200 dark:border-gray-700"
                )}
                aria-label="Layers"
              >
                <Layers className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <span>Layers</span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Operators Group */}
      <div
        className={cn(
          "flex items-center gap-2 transition-all duration-200 ease-out",
          isExpanded
            ? "opacity-100 translate-x-0"
            : "opacity-0 -translate-x-4 pointer-events-none"
        )}
      >
        <OperatorCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Gradient"
          isSelected={selectedLayers.has('gradient')}
          onClick={() => toggleLayer('gradient')}
        />
        <OperatorCard
          icon={<Wind className="w-5 h-5" />}
          label="Divergence"
          isSelected={selectedLayers.has('divergence')}
          onClick={() => toggleLayer('divergence')}
        />
        <OperatorCard
          icon={<Repeat className="w-5 h-5" />}
          label="Curl"
          isSelected={selectedLayers.has('curl')}
          onClick={() => toggleLayer('curl')}
        />
        <OperatorCard
          icon={<MoreHorizontal className="w-5 h-5" />}
          label="More"
          isSelected={false}
          onClick={() => console.log('More clicked')}
        />
      </div>
    </div>
  );
}
import React, { useState } from 'react';
import { X, Ruler, Route, Pipette, Lasso, Camera } from 'lucide-react';
import { Button } from './ui/button';

interface ToolsPanelProps {
  onClose: () => void;
  activeTool: string | null;
  onToolChange: (tool: string | null) => void;
}

const tools = [
  {
    id: 'measure',
    icon: Ruler,
    label: 'Measure distance',
    description: 'Click two points to measure Euclidean distance',
  },
  {
    id: 'geodesic',
    icon: Route,
    label: 'Measure geodesic distance',
    description: 'Measure distance along the mesh surface',
  },
  {
    id: 'probe',
    icon: Pipette,
    label: 'Probe value',
    description: 'Click to inspect scalar values at a point',
  },
  {
    id: 'select',
    icon: Lasso,
    label: 'Select region',
    description: 'Draw a lasso to select vertices or paint regions',
  },
  {
    id: 'screenshot',
    icon: Camera,
    label: 'Screenshot / Export view',
    description: 'Capture the current view as an image',
  },
];

export function ToolsPanel({ onClose, activeTool, onToolChange }: ToolsPanelProps) {
  return (
    <div
      className="fixed top-28 right-4 w-80 bg-white dark:bg-gray-800 shadow-xl rounded-lg overflow-hidden z-40"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="font-medium">Tools</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onClose}
          aria-label="Close tools panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="px-4 py-3 space-y-1">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;

          return (
            <button
              key={tool.id}
              onClick={() => onToolChange(isActive ? null : tool.id)}
              className={`w-full flex items-start gap-3 p-3 rounded-lg transition-all ${
                isActive
                  ? 'bg-blue-100 dark:bg-blue-950/30 border-2 border-blue-500'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent'
              }`}
            >
              <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${isActive ? 'text-blue-600 dark:text-blue-400' : ''}`} />
              <div className="flex-1 text-left">
                <div className={`text-sm font-medium ${isActive ? 'text-blue-900 dark:text-blue-100' : ''}`}>
                  {tool.label}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {tool.description}
                </div>
                {isActive && (
                  <div className="mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToolChange(null);
                      }}
                    >
                      Exit tool
                    </Button>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

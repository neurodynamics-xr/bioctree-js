import React from 'react';
import { ToolType } from '../types/tools';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';

export interface MoveOptions {
  mode: 'orbit' | 'pan' | 'zoom';
  showGizmo: boolean;
  sensitivity: number;
}

export interface SelectOptions {
  mode: 'vertex' | 'edge' | 'face';
  additive: boolean;
}

export interface BrushOptions {
  type: 'graph' | 'heat';
  size: number;
  heatT: number;
  heatK: number;
  previewFootprint: boolean;
}

interface ToolOptionsBarProps {
  activeTool: ToolType;
  moveOptions: MoveOptions;
  selectOptions: SelectOptions;
  brushOptions: BrushOptions;
  onMoveOptionsChange: (options: MoveOptions) => void;
  onSelectOptionsChange: (options: SelectOptions) => void;
  onBrushOptionsChange: (options: BrushOptions) => void;
  onClearSelection: () => void;
}

export function ToolOptionsBar({
  activeTool,
  moveOptions,
  selectOptions,
  brushOptions,
  onMoveOptionsChange,
  onSelectOptionsChange,
  onBrushOptionsChange,
  onClearSelection,
}: ToolOptionsBarProps) {
  return (
    <div className="flex items-center h-12 px-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 gap-6">
      {/* Move Tool Options */}
      {activeTool === 'move' && (
        <>
          <div className="flex items-center gap-2">
            <Label className="text-sm text-gray-600 dark:text-gray-400 shrink-0">Mode:</Label>
            <ToggleGroup
              type="single"
              value={moveOptions.mode}
              onValueChange={(value) => {
                if (value) {
                  onMoveOptionsChange({ ...moveOptions, mode: value as 'orbit' | 'pan' | 'zoom' });
                }
              }}
              className="bg-gray-100 dark:bg-gray-900 rounded-md"
            >
              <ToggleGroupItem value="orbit" className="px-3 py-1 text-sm">
                Orbit
              </ToggleGroupItem>
              <ToggleGroupItem value="pan" className="px-3 py-1 text-sm">
                Pan
              </ToggleGroupItem>
              <ToggleGroupItem value="zoom" className="px-3 py-1 text-sm">
                Zoom
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="show-gizmo"
              checked={moveOptions.showGizmo}
              onCheckedChange={(checked) =>
                onMoveOptionsChange({ ...moveOptions, showGizmo: checked })
              }
            />
            <Label htmlFor="show-gizmo" className="text-sm text-gray-600 dark:text-gray-400">
              Show Gizmo
            </Label>
          </div>

          <div className="flex items-center gap-3 min-w-[200px]">
            <Label className="text-sm text-gray-600 dark:text-gray-400 shrink-0">
              Sensitivity:
            </Label>
            <Slider
              value={[moveOptions.sensitivity]}
              onValueChange={(value) =>
                onMoveOptionsChange({ ...moveOptions, sensitivity: value[0] })
              }
              min={0.1}
              max={2.0}
              step={0.1}
              className="flex-1"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400 w-8 text-right">
              {moveOptions.sensitivity.toFixed(1)}
            </span>
          </div>
        </>
      )}

      {/* Select Tool Options */}
      {activeTool === 'select' && (
        <>
          <div className="flex items-center gap-2">
            <Label className="text-sm text-gray-600 dark:text-gray-400 shrink-0">Type:</Label>
            <ToggleGroup
              type="single"
              value={selectOptions.mode}
              onValueChange={(value) => {
                if (value) {
                  onSelectOptionsChange({ ...selectOptions, mode: value as 'vertex' | 'edge' | 'face' });
                }
              }}
              className="bg-gray-100 dark:bg-gray-900 rounded-md"
            >
              <ToggleGroupItem value="vertex" className="px-3 py-1 text-sm">
                Vertex
              </ToggleGroupItem>
              <ToggleGroupItem value="edge" className="px-3 py-1 text-sm">
                Edge
              </ToggleGroupItem>
              <ToggleGroupItem value="face" className="px-3 py-1 text-sm">
                Face
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="additive"
              checked={selectOptions.additive}
              onCheckedChange={(checked) =>
                onSelectOptionsChange({ ...selectOptions, additive: checked })
              }
            />
            <Label htmlFor="additive" className="text-sm text-gray-600 dark:text-gray-400">
              Additive (Shift)
            </Label>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onClearSelection}
            className="h-8"
          >
            Clear Selection
          </Button>
        </>
      )}

      {/* Brush Tool Options */}
      {activeTool === 'brush' && (
        <>
          <div className="flex items-center gap-2">
            <Label className="text-sm text-gray-600 dark:text-gray-400 shrink-0">Type:</Label>
            <Select
              value={brushOptions.type}
              onValueChange={(value: 'graph' | 'heat') =>
                onBrushOptionsChange({ ...brushOptions, type: value })
              }
            >
              <SelectTrigger className="w-[140px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="graph">Graph Brush</SelectItem>
                <SelectItem value="heat">Heat Brush</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3 min-w-[200px]">
            <Label className="text-sm text-gray-600 dark:text-gray-400 shrink-0">
              Size:
            </Label>
            <Slider
              value={[brushOptions.size]}
              onValueChange={(value) =>
                onBrushOptionsChange({ ...brushOptions, size: value[0] })
              }
              min={1}
              max={200}
              step={1}
              className="flex-1"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400 w-10 text-right">
              {Math.round(brushOptions.size)}
            </span>
          </div>

          {brushOptions.type === 'heat' && (
            <>
              <div className="flex items-center gap-3 min-w-[180px]">
                <Label className="text-sm text-gray-600 dark:text-gray-400 shrink-0">
                  t:
                </Label>
                <Slider
                  value={[brushOptions.heatT]}
                  onValueChange={(value) =>
                    onBrushOptionsChange({ ...brushOptions, heatT: value[0] })
                  }
                  min={0}
                  max={1}
                  step={0.01}
                  className="flex-1"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400 w-10 text-right">
                  {brushOptions.heatT.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center gap-3 min-w-[180px]">
                <Label className="text-sm text-gray-600 dark:text-gray-400 shrink-0">
                  k:
                </Label>
                <Slider
                  value={[brushOptions.heatK]}
                  onValueChange={(value) =>
                    onBrushOptionsChange({ ...brushOptions, heatK: value[0] })
                  }
                  min={1}
                  max={1000}
                  step={1}
                  className="flex-1"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400 w-12 text-right">
                  {Math.round(brushOptions.heatK)}
                </span>
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <Switch
              id="preview-footprint"
              checked={brushOptions.previewFootprint}
              onCheckedChange={(checked) =>
                onBrushOptionsChange({ ...brushOptions, previewFootprint: checked })
              }
            />
            <Label htmlFor="preview-footprint" className="text-sm text-gray-600 dark:text-gray-400">
              Preview Footprint
            </Label>
          </div>
        </>
      )}
    </div>
  );
}

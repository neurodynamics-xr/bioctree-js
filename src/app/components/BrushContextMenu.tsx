import React from 'react';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  BrushFamily,
  PatchType,
  BrushPatchState,
  BrushPathState,
  BrushTimeState,
} from '../types/tools';

interface BrushContextMenuProps {
  brushFamily: BrushFamily;
  patchType: PatchType;
  brushPatch: BrushPatchState;
  brushPath: BrushPathState;
  brushTime: BrushTimeState;
  onBrushPatchChange: (state: BrushPatchState) => void;
  onBrushPathChange: (state: BrushPathState) => void;
  onBrushTimeChange: (state: BrushTimeState) => void;
}

export function BrushContextMenu({
  brushFamily,
  patchType,
  brushPatch,
  brushPath,
  brushTime,
  onBrushPatchChange,
  onBrushPathChange,
  onBrushTimeChange,
}: BrushContextMenuProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  // Don't show for 'none' or 'simplex'
  if (brushFamily === 'none' || brushFamily === 'simplex') {
    return null;
  }

  // Get brush label
  const getBrushLabel = () => {
    if (brushFamily === 'patch') {
      if (patchType === 'spectral') return 'Spectral';
      if (patchType === 'graph') return 'Graph';
      if (patchType === 'geodesic') return 'Geodesic';
    }
    if (brushFamily === 'path') return 'Path';
    if (brushFamily === 'time') return 'Time';
    return 'Brush';
  };

  // Patch brush
  if (brushFamily === 'patch') {
    return (
      <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-lg w-48">
        {/* Header */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full px-2 py-1.5 flex items-center justify-between hover:bg-gray-700/50 rounded-t-lg transition-colors"
        >
          <span className="text-[10px] font-medium text-gray-300">{getBrushLabel()}</span>
          {isCollapsed ? (
            <ChevronUp className="w-3 h-3 text-gray-400" />
          ) : (
            <ChevronDown className="w-3 h-3 text-gray-400" />
          )}
        </button>

        {/* Content */}
        {!isCollapsed && (
          <div className="p-2 space-y-2 border-t border-gray-700">
            {/* Graph - Nearest (k-ring) */}
            {patchType === 'graph' && (
              <>
                {/* Size */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] text-gray-300">Size</Label>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {Math.round(brushPatch.size)}
                    </span>
                  </div>
                  <Slider
                    value={[brushPatch.size]}
                    onValueChange={(value) =>
                      onBrushPatchChange({ ...brushPatch, size: value[0] })
                    }
                    min={1}
                    max={200}
                    step={1}
                    className="w-full"
                  />
                </div>

                {/* Depth */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] text-gray-300">Depth</Label>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {Math.round(brushPatch.depthK)}
                    </span>
                  </div>
                  <Slider
                    value={[brushPatch.depthK]}
                    onValueChange={(value) =>
                      onBrushPatchChange({ ...brushPatch, depthK: value[0] })
                    }
                    min={1}
                    max={20}
                    step={1}
                    className="w-full"
                  />
                </div>
              </>
            )}

            {/* Spectral - Heat */}
            {patchType === 'spectral' && (
              <>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] text-gray-300">Heat (t)</Label>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {brushPatch.heatT.toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    value={[brushPatch.heatT]}
                    onValueChange={(value) =>
                      onBrushPatchChange({ ...brushPatch, heatT: value[0] })
                    }
                    min={0}
                    max={1}
                    step={0.01}
                    className="w-full"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] text-gray-300">Modes (k)</Label>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {Math.round(brushPatch.heatK)}
                    </span>
                  </div>
                  <Slider
                    value={[brushPatch.heatK]}
                    onValueChange={(value) =>
                      onBrushPatchChange({ ...brushPatch, heatK: value[0] })
                    }
                    min={1}
                    max={1000}
                    step={1}
                    className="w-full"
                  />
                </div>
              </>
            )}

            {/* Geodesic - Gaussian */}
            {patchType === 'geodesic' && (
              <>
                {/* Size */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] text-gray-300">Size</Label>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {Math.round(brushPatch.size)}
                    </span>
                  </div>
                  <Slider
                    value={[brushPatch.size]}
                    onValueChange={(value) =>
                      onBrushPatchChange({ ...brushPatch, size: value[0] })
                    }
                    min={1}
                    max={200}
                    step={1}
                    className="w-full"
                  />
                </div>

                {/* Sigma */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] text-gray-300">Sigma (σ)</Label>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {brushPatch.sigma.toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    value={[brushPatch.sigma]}
                    onValueChange={(value) =>
                      onBrushPatchChange({ ...brushPatch, sigma: value[0] })
                    }
                    min={0.1}
                    max={10}
                    step={0.1}
                    className="w-full"
                  />
                </div>
              </>
            )}

            {/* Preview Footprint */}
            <div className="flex items-center justify-between pt-1 border-t border-gray-700">
              <Label htmlFor="ctx-preview" className="text-[10px] text-gray-300">
                Preview
              </Label>
              <Switch
                id="ctx-preview"
                checked={brushPatch.previewFootprint}
                onCheckedChange={(checked) =>
                  onBrushPatchChange({ ...brushPatch, previewFootprint: checked })
                }
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Path brush
  if (brushFamily === 'path') {
    return (
      <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-lg w-48">
        {/* Header */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full px-2 py-1.5 flex items-center justify-between hover:bg-gray-700/50 rounded-t-lg transition-colors"
        >
          <span className="text-[10px] font-medium text-gray-300">{getBrushLabel()}</span>
          {isCollapsed ? (
            <ChevronUp className="w-3 h-3 text-gray-400" />
          ) : (
            <ChevronDown className="w-3 h-3 text-gray-400" />
          )}
        </button>

        {/* Content */}
        {!isCollapsed && (
          <div className="p-2 space-y-2 border-t border-gray-700">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] text-gray-300">Step Size</Label>
                <span className="text-[10px] text-gray-400 font-mono">
                  {brushPath.stepSize.toFixed(1)}
                </span>
              </div>
              <Slider
                value={[brushPath.stepSize]}
                onValueChange={(value) =>
                  onBrushPathChange({ ...brushPath, stepSize: value[0] })
                }
                min={0.1}
                max={10}
                step={0.1}
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Time brush
  if (brushFamily === 'time') {
    return (
      <div className="bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-lg w-48">
        {/* Header */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full px-2 py-1.5 flex items-center justify-between hover:bg-gray-700/50 rounded-t-lg transition-colors"
        >
          <span className="text-[10px] font-medium text-gray-300">{getBrushLabel()}</span>
          {isCollapsed ? (
            <ChevronUp className="w-3 h-3 text-gray-400" />
          ) : (
            <ChevronDown className="w-3 h-3 text-gray-400" />
          )}
        </button>

        {/* Content */}
        {!isCollapsed && (
          <div className="p-2 space-y-2 border-t border-gray-700">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] text-gray-300">Time Window</Label>
                <span className="text-[10px] text-gray-400 font-mono">
                  {brushTime.timeWindow.toFixed(1)}
                </span>
              </div>
              <Slider
                value={[brushTime.timeWindow]}
                onValueChange={(value) =>
                  onBrushTimeChange({ ...brushTime, timeWindow: value[0] })
                }
                min={0.1}
                max={5}
                step={0.1}
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
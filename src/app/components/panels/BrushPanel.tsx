import React from 'react';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import {
  BrushFamily,
  BrushPatchState,
  BrushPathState,
  BrushTimeState,
  PatchType,
} from '../../types/tools';

interface BrushPanelProps {
  brushFamily: BrushFamily;
  patchType: PatchType;
  brushPatch: BrushPatchState;
  brushPath: BrushPathState;
  brushTime: BrushTimeState;
  onBrushPatchChange: (state: BrushPatchState) => void;
  onBrushPathChange: (state: BrushPathState) => void;
  onBrushTimeChange: (state: BrushTimeState) => void;
}

export function BrushPanel({
  brushFamily,
  patchType,
  brushPatch,
  brushPath,
  brushTime,
  onBrushPatchChange,
  onBrushPathChange,
  onBrushTimeChange,
}: BrushPanelProps) {
  // Patch brush
  if (brushFamily === 'patch') {
    return (
      <div className="space-y-3 text-sm">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Size</Label>
            <span className="text-xs text-gray-400">
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

        {/* Patch type specific parameters */}
        {patchType === 'graph' && (
          <>
            <Separator className="bg-gray-700" />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-gray-300">Depth (k-ring)</Label>
                <span className="text-xs text-gray-400">
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

        {patchType === 'spectral' && (
          <>
            <Separator className="bg-gray-700" />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-gray-300">Heat Parameter (τ)</Label>
                <span className="text-xs text-gray-400">
                  {brushPatch.heatT.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[brushPatch.heatT]}
                onValueChange={(value) =>
                  onBrushPatchChange({ ...brushPatch, heatT: value[0] })
                }
                min={0.001}
                max={10}
                step={0.01}
                className="w-full"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Controls heat diffusion time. Smaller = localized, larger = spread out.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-gray-300">Eigenmode Truncation (k)</Label>
                <span className="text-xs text-gray-400">
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

        {patchType === 'geodesic' && (
          <>
            <Separator className="bg-gray-700" />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-gray-300">Sigma (σ)</Label>
                <span className="text-xs text-gray-400">
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

        <Separator className="bg-gray-700" />

        <div className="flex items-center justify-between">
          <Label htmlFor="preview-footprint" className="text-xs text-gray-300">
            Preview Footprint
          </Label>
          <Switch
            id="preview-footprint"
            checked={brushPatch.previewFootprint}
            onCheckedChange={(checked) =>
              onBrushPatchChange({ ...brushPatch, previewFootprint: checked })
            }
          />
        </div>
      </div>
    );
  }

  // Path brush
  if (brushFamily === 'path') {
    return (
      <div className="space-y-3 text-sm">
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-400">Path Brush</Label>
          <p className="text-xs text-gray-500">
            Click to set start/end points for geodesic path
          </p>
        </div>

        <Separator className="bg-gray-700" />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Step Size</Label>
            <span className="text-xs text-gray-400">
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
    );
  }

  // Time brush
  if (brushFamily === 'time') {
    return (
      <div className="space-y-3 text-sm">
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-400">Time Brush (Dynamic)</Label>
          <p className="text-xs text-gray-500">
            Evolve heat/diffusion over time window
          </p>
        </div>

        <Separator className="bg-gray-700" />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Time Window</Label>
            <span className="text-xs text-gray-400">
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
    );
  }

  return null;
}
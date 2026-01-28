/**
 * SpectralBrushPanel.tsx
 * 
 * Controls for spectral brush visualization
 * - Heat parameter (tau) control
 * - Eigenmode truncation (Kactive)
 * - Selected vertex display
 * - Colormap selection
 */

import { Slider } from '../ui/slider';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

export interface SpectralBrushConfig {
  tau: number;
  Kactive: number;
  selectedVertex: number | null;
  colormapType: 'inferno' | 'viridis' | 'plasma' | 'grayscale' | 'coolwarm';
  enabled: boolean;
}

interface SpectralBrushPanelProps {
  config: SpectralBrushConfig;
  maxK?: number;
  onTauChange: (tau: number) => void;
  onKactiveChange: (Kactive: number) => void;
  onColormapChange: (colormap: string) => void;
  onToggle: (enabled: boolean) => void;
}

export function SpectralBrushPanel({
  config,
  maxK = 256,
  onTauChange,
  onKactiveChange,
  onColormapChange,
  onToggle,
}: SpectralBrushPanelProps) {
  return (
    <div className="space-y-4 text-sm">
      {/* Selected vertex display */}
      <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
        <Label className="text-xs text-gray-300 mb-2 block">Selected Vertex</Label>
        {config.selectedVertex !== null ? (
          <div className="text-green-400 font-mono text-lg">
            Vertex #{config.selectedVertex}
          </div>
        ) : (
          <div className="text-gray-500 text-sm italic">
            Click on mesh to select vertex
          </div>
        )}
      </div>

      <Separator className="bg-gray-700" />

      {/* Heat parameter (tau) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-gray-300">Heat Diffusion Time (τ)</Label>
          <span className="text-xs text-gray-400 font-mono">
            {config.tau.toFixed(3)}
          </span>
        </div>
        <Slider
          value={[config.tau]}
          onValueChange={(value) => onTauChange(value[0])}
          min={0.001}
          max={1.0}
          step={0.001}
          className="w-full"
        />
        <p className="text-[10px] text-gray-500">
          Smaller = localized heat kernel, larger = diffused across mesh
        </p>
      </div>

      {/* Eigenmode truncation */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-gray-300">Eigenmode Truncation (K)</Label>
          <span className="text-xs text-gray-400 font-mono">
            {config.Kactive} / {maxK}
          </span>
        </div>
        <Slider
          value={[config.Kactive]}
          onValueChange={(value) => onKactiveChange(value[0])}
          min={16}
          max={maxK}
          step={1}
          className="w-full"
        />
        <p className="text-[10px] text-gray-500">
          Number of eigenmodes used in reconstruction. Higher = more accurate, slower.
        </p>
      </div>

      <Separator className="bg-gray-700" />

      {/* Colormap selection */}
      <div className="space-y-2">
        <Label className="text-xs text-gray-300">Colormap</Label>
        <Select
          value={config.colormapType}
          onValueChange={onColormapChange}
        >
          <SelectTrigger className="w-full bg-gray-800 border-gray-700">
            <SelectValue placeholder="Select colormap" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inferno">Inferno (hot)</SelectItem>
            <SelectItem value="viridis">Viridis (perceptual)</SelectItem>
            <SelectItem value="plasma">Plasma (bright)</SelectItem>
            <SelectItem value="coolwarm">Cool-Warm (diverging)</SelectItem>
            <SelectItem value="grayscale">Grayscale</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Info box */}
      <div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-3 text-xs text-gray-400 space-y-1">
        <div className="font-semibold text-blue-400">How to use:</div>
        <ol className="list-decimal list-inside space-y-1 text-[11px]">
          <li>Click on a vertex in the mesh</li>
          <li>Heat kernel visualizes diffusion from that point</li>
          <li>Adjust τ to control spread</li>
          <li>Adjust K for accuracy/performance tradeoff</li>
        </ol>
      </div>
    </div>
  );
}

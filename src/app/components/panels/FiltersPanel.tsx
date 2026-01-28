import React from 'react';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Separator } from '../ui/separator';
import {
  Flame,
  Activity,
  Droplet,
  Waves,
  Wind,
  Sparkles,
} from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';
import {
  FilterFamily,
  FilterHeatState,
  FilterWaveletState,
  FilterDiffusionState,
  FilterWaveState,
  FilterDampedWaveState,
  FilterDynamicState,
} from '../../types/tools';

interface FiltersPanelProps {
  filterFamily: FilterFamily;
  filterHeat: FilterHeatState;
  filterWavelet: FilterWaveletState;
  filterDiffusion: FilterDiffusionState;
  filterWave: FilterWaveState;
  filterDampedWave: FilterDampedWaveState;
  filterDynamic: FilterDynamicState;
  onFilterFamilyChange?: (family: FilterFamily) => void;
  onFilterHeatChange: (state: FilterHeatState) => void;
  onFilterWaveletChange: (state: FilterWaveletState) => void;
  onFilterDiffusionChange: (state: FilterDiffusionState) => void;
  onFilterWaveChange: (state: FilterWaveState) => void;
  onFilterDampedWaveChange: (state: FilterDampedWaveState) => void;
  onFilterDynamicChange: (state: FilterDynamicState) => void;
}

const filterTypes = [
  { id: 'heat', icon: Flame, label: 'Heat' },
  { id: 'wavelet', icon: Activity, label: 'Wavelet' },
  { id: 'diffusion', icon: Droplet, label: 'Diffusion' },
  { id: 'wave', icon: Waves, label: 'Wave' },
  { id: 'damped-wave', icon: Wind, label: 'Damped' },
  { id: 'dynamic', icon: Sparkles, label: 'Dynamic' },
] as const;

export function FiltersPanel({
  filterFamily,
  filterHeat,
  filterWavelet,
  filterDiffusion,
  filterWave,
  filterDampedWave,
  filterDynamic,
  onFilterFamilyChange,
  onFilterHeatChange,
  onFilterWaveletChange,
  onFilterDiffusionChange,
  onFilterWaveChange,
  onFilterDampedWaveChange,
  onFilterDynamicChange,
}: FiltersPanelProps) {
  // Render filter type tabs
  const renderFilterTabs = () => {
    if (!onFilterFamilyChange) return null;
    
    return (
      <>
        <div className="grid grid-cols-3 gap-1 p-1 bg-gray-800/50 rounded-md mb-3">
          {filterTypes.map((type) => {
            const Icon = type.icon;
            const isActive = filterFamily === type.id;
            return (
              <Button
                key={type.id}
                variant="ghost"
                size="sm"
                onClick={() => onFilterFamilyChange(type.id as FilterFamily)}
                className={cn(
                  'flex flex-col items-center gap-1 h-auto py-2 px-1',
                  isActive
                    ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                    : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/50'
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[10px] leading-none">{type.label}</span>
              </Button>
            );
          })}
        </div>
        <Separator className="bg-gray-700 mb-3" />
      </>
    );
  };

  // Heat filter
  if (filterFamily === 'heat') {
    return (
      <div className="space-y-3 text-sm">
        {renderFilterTabs()}
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-400">Heat Diffusion</Label>
          <p className="text-xs text-gray-500">
            Apply heat equation diffusion to smooth the mesh
          </p>
        </div>

        <Separator className="bg-gray-700" />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Diffusivity</Label>
            <span className="text-xs text-gray-400">
              {filterHeat.diffusivity.toFixed(2)}
            </span>
          </div>
          <Slider
            value={[filterHeat.diffusivity]}
            onValueChange={(value) =>
              onFilterHeatChange({ ...filterHeat, diffusivity: value[0] })
            }
            min={0.01}
            max={1}
            step={0.01}
            className="w-full"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Time Step</Label>
            <span className="text-xs text-gray-400">
              {filterHeat.timeStep.toFixed(3)}
            </span>
          </div>
          <Slider
            value={[filterHeat.timeStep]}
            onValueChange={(value) =>
              onFilterHeatChange({ ...filterHeat, timeStep: value[0] })
            }
            min={0.001}
            max={0.1}
            step={0.001}
            className="w-full"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Iterations</Label>
            <span className="text-xs text-gray-400">
              {Math.round(filterHeat.iterations)}
            </span>
          </div>
          <Slider
            value={[filterHeat.iterations]}
            onValueChange={(value) =>
              onFilterHeatChange({ ...filterHeat, iterations: value[0] })
            }
            min={1}
            max={100}
            step={1}
            className="w-full"
          />
        </div>
      </div>
    );
  }

  // Wavelet filter
  if (filterFamily === 'wavelet') {
    return (
      <div className="space-y-3 text-sm">
        {renderFilterTabs()}
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-400">Wavelet Transform</Label>
          <p className="text-xs text-gray-500">
            Multiscale decomposition and filtering
          </p>
        </div>

        <Separator className="bg-gray-700" />

        <div className="space-y-1.5">
          <Label className="text-xs text-gray-300">Wavelet Type</Label>
          <Select
            value={filterWavelet.waveletType}
            onValueChange={(value: 'haar' | 'db4' | 'sym4') =>
              onFilterWaveletChange({ ...filterWavelet, waveletType: value })
            }
          >
            <SelectTrigger className="w-full h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="haar">Haar</SelectItem>
              <SelectItem value="db4">Daubechies 4</SelectItem>
              <SelectItem value="sym4">Symlet 4</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator className="bg-gray-700" />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Decomposition Level</Label>
            <span className="text-xs text-gray-400">
              {Math.round(filterWavelet.level)}
            </span>
          </div>
          <Slider
            value={[filterWavelet.level]}
            onValueChange={(value) =>
              onFilterWaveletChange({ ...filterWavelet, level: value[0] })
            }
            min={1}
            max={10}
            step={1}
            className="w-full"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Threshold</Label>
            <span className="text-xs text-gray-400">
              {filterWavelet.threshold.toFixed(2)}
            </span>
          </div>
          <Slider
            value={[filterWavelet.threshold]}
            onValueChange={(value) =>
              onFilterWaveletChange({ ...filterWavelet, threshold: value[0] })
            }
            min={0}
            max={1}
            step={0.01}
            className="w-full"
          />
        </div>
      </div>
    );
  }

  // Diffusion filter
  if (filterFamily === 'diffusion') {
    return (
      <div className="space-y-3 text-sm">
        {renderFilterTabs()}
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-400">Anisotropic Diffusion</Label>
          <p className="text-xs text-gray-500">
            Edge-preserving smoothing filter
          </p>
        </div>

        <Separator className="bg-gray-700" />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Lambda (λ)</Label>
            <span className="text-xs text-gray-400">
              {filterDiffusion.lambda.toFixed(2)}
            </span>
          </div>
          <Slider
            value={[filterDiffusion.lambda]}
            onValueChange={(value) =>
              onFilterDiffusionChange({ ...filterDiffusion, lambda: value[0] })
            }
            min={0}
            max={1}
            step={0.01}
            className="w-full"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Iterations</Label>
            <span className="text-xs text-gray-400">
              {Math.round(filterDiffusion.iterations)}
            </span>
          </div>
          <Slider
            value={[filterDiffusion.iterations]}
            onValueChange={(value) =>
              onFilterDiffusionChange({ ...filterDiffusion, iterations: value[0] })
            }
            min={1}
            max={100}
            step={1}
            className="w-full"
          />
        </div>

        <Separator className="bg-gray-700" />

        <div className="flex items-center justify-between">
          <Label htmlFor="preserve-features" className="text-xs text-gray-300">
            Preserve Features
          </Label>
          <Switch
            id="preserve-features"
            checked={filterDiffusion.preserveFeatures}
            onCheckedChange={(checked) =>
              onFilterDiffusionChange({ ...filterDiffusion, preserveFeatures: checked })
            }
          />
        </div>
      </div>
    );
  }

  // Wave filter
  if (filterFamily === 'wave') {
    return (
      <div className="space-y-3 text-sm">
        {renderFilterTabs()}
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-400">Wave Equation</Label>
          <p className="text-xs text-gray-500">
            Simulate wave propagation on mesh
          </p>
        </div>

        <Separator className="bg-gray-700" />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Frequency</Label>
            <span className="text-xs text-gray-400">
              {filterWave.frequency.toFixed(1)} Hz
            </span>
          </div>
          <Slider
            value={[filterWave.frequency]}
            onValueChange={(value) =>
              onFilterWaveChange({ ...filterWave, frequency: value[0] })
            }
            min={0.1}
            max={10}
            step={0.1}
            className="w-full"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Amplitude</Label>
            <span className="text-xs text-gray-400">
              {filterWave.amplitude.toFixed(2)}
            </span>
          </div>
          <Slider
            value={[filterWave.amplitude]}
            onValueChange={(value) =>
              onFilterWaveChange({ ...filterWave, amplitude: value[0] })
            }
            min={0}
            max={1}
            step={0.01}
            className="w-full"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Wave Speed</Label>
            <span className="text-xs text-gray-400">
              {filterWave.waveSpeed.toFixed(1)}
            </span>
          </div>
          <Slider
            value={[filterWave.waveSpeed]}
            onValueChange={(value) =>
              onFilterWaveChange({ ...filterWave, waveSpeed: value[0] })
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

  // Damped Wave filter
  if (filterFamily === 'damped-wave') {
    return (
      <div className="space-y-3 text-sm">
        {renderFilterTabs()}
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-400">Damped Wave Equation</Label>
          <p className="text-xs text-gray-500">
            Wave propagation with damping
          </p>
        </div>

        <Separator className="bg-gray-700" />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Frequency</Label>
            <span className="text-xs text-gray-400">
              {filterDampedWave.frequency.toFixed(1)} Hz
            </span>
          </div>
          <Slider
            value={[filterDampedWave.frequency]}
            onValueChange={(value) =>
              onFilterDampedWaveChange({ ...filterDampedWave, frequency: value[0] })
            }
            min={0.1}
            max={10}
            step={0.1}
            className="w-full"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Amplitude</Label>
            <span className="text-xs text-gray-400">
              {filterDampedWave.amplitude.toFixed(2)}
            </span>
          </div>
          <Slider
            value={[filterDampedWave.amplitude]}
            onValueChange={(value) =>
              onFilterDampedWaveChange({ ...filterDampedWave, amplitude: value[0] })
            }
            min={0}
            max={1}
            step={0.01}
            className="w-full"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Damping Factor</Label>
            <span className="text-xs text-gray-400">
              {filterDampedWave.dampingFactor.toFixed(2)}
            </span>
          </div>
          <Slider
            value={[filterDampedWave.dampingFactor]}
            onValueChange={(value) =>
              onFilterDampedWaveChange({ ...filterDampedWave, dampingFactor: value[0] })
            }
            min={0}
            max={1}
            step={0.01}
            className="w-full"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Wave Speed</Label>
            <span className="text-xs text-gray-400">
              {filterDampedWave.waveSpeed.toFixed(1)}
            </span>
          </div>
          <Slider
            value={[filterDampedWave.waveSpeed]}
            onValueChange={(value) =>
              onFilterDampedWaveChange({ ...filterDampedWave, waveSpeed: value[0] })
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

  // Dynamic filter
  if (filterFamily === 'dynamic') {
    return (
      <div className="space-y-3 text-sm">
        {renderFilterTabs()}
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-400">Dynamic Filtering</Label>
          <p className="text-xs text-gray-500">
            Adaptive time-varying filter
          </p>
        </div>

        <Separator className="bg-gray-700" />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Time Window</Label>
            <span className="text-xs text-gray-400">
              {filterDynamic.timeWindow.toFixed(1)} s
            </span>
          </div>
          <Slider
            value={[filterDynamic.timeWindow]}
            onValueChange={(value) =>
              onFilterDynamicChange({ ...filterDynamic, timeWindow: value[0] })
            }
            min={0.1}
            max={10}
            step={0.1}
            className="w-full"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300">Adaptive Rate</Label>
            <span className="text-xs text-gray-400">
              {filterDynamic.adaptiveRate.toFixed(2)}
            </span>
          </div>
          <Slider
            value={[filterDynamic.adaptiveRate]}
            onValueChange={(value) =>
              onFilterDynamicChange({ ...filterDynamic, adaptiveRate: value[0] })
            }
            min={0}
            max={1}
            step={0.01}
            className="w-full"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-400">Filter Type</Label>
        <p className="text-xs text-gray-500">
          Choose the type of filter to apply
        </p>
      </div>

      <Separator className="bg-gray-700" />

      <div className="space-y-1.5">
        <Label className="text-xs text-gray-300">Filter Type</Label>
        <Select
          value={filterFamily}
          onValueChange={(value: FilterFamily) => onFilterFamilyChange?.(value)}
        >
          <SelectTrigger className="w-full h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {filterTypes.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                <type.icon className="mr-2 h-4 w-4" />
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
import React, { useState } from 'react';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Slider } from '../ui/slider';
import { Separator } from '../ui/separator';

export function ScenePanel() {
  const [lighting, setLighting] = useState({
    ambient: true,
    directional: true,
    shadows: false,
  });

  const [lightIntensity, setLightIntensity] = useState(1.0);
  const [ambientOcclusion, setAmbientOcclusion] = useState(0.5);

  const [helpers, setHelpers] = useState({
    axes: true,
    grid: false,
    boundingBox: false,
  });

  const toggleLighting = (key: keyof typeof lighting) => {
    setLighting({ ...lighting, [key]: !lighting[key] });
  };

  const toggleHelper = (key: keyof typeof helpers) => {
    setHelpers({ ...helpers, [key]: !helpers[key] });
  };

  return (
    <div className="space-y-4">
      {/* Lighting */}
      <div className="space-y-2">
        <Label className="text-xs text-gray-400">Lighting</Label>

        <div className="flex items-center justify-between py-1">
          <Label htmlFor="ambient" className="text-xs text-gray-300 cursor-pointer">
            Ambient Light
          </Label>
          <Switch
            id="ambient"
            checked={lighting.ambient}
            onCheckedChange={() => toggleLighting('ambient')}
          />
        </div>

        <div className="flex items-center justify-between py-1">
          <Label htmlFor="directional" className="text-xs text-gray-300 cursor-pointer">
            Directional Light
          </Label>
          <Switch
            id="directional"
            checked={lighting.directional}
            onCheckedChange={() => toggleLighting('directional')}
          />
        </div>

        <div className="flex items-center justify-between py-1">
          <Label htmlFor="shadows" className="text-xs text-gray-300 cursor-pointer">
            Cast Shadows
          </Label>
          <Switch
            id="shadows"
            checked={lighting.shadows}
            onCheckedChange={() => toggleLighting('shadows')}
          />
        </div>
      </div>

      <Separator className="bg-gray-700" />

      {/* Light Intensity */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-gray-300">Light Intensity</Label>
          <span className="text-xs text-gray-400">{lightIntensity.toFixed(1)}</span>
        </div>
        <Slider
          value={[lightIntensity]}
          onValueChange={(value) => setLightIntensity(value[0])}
          min={0}
          max={2}
          step={0.1}
          className="w-full"
        />
      </div>

      {/* Ambient Occlusion */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-gray-300">Ambient Occlusion</Label>
          <span className="text-xs text-gray-400">{ambientOcclusion.toFixed(1)}</span>
        </div>
        <Slider
          value={[ambientOcclusion]}
          onValueChange={(value) => setAmbientOcclusion(value[0])}
          min={0}
          max={1}
          step={0.1}
          className="w-full"
        />
      </div>

      <Separator className="bg-gray-700" />

      {/* Scene Helpers */}
      <div className="space-y-2">
        <Label className="text-xs text-gray-400">Scene Helpers</Label>

        <div className="flex items-center justify-between py-1">
          <Label htmlFor="axes" className="text-xs text-gray-300 cursor-pointer">
            Coordinate Axes
          </Label>
          <Switch
            id="axes"
            checked={helpers.axes}
            onCheckedChange={() => toggleHelper('axes')}
          />
        </div>

        <div className="flex items-center justify-between py-1">
          <Label htmlFor="grid" className="text-xs text-gray-300 cursor-pointer">
            Ground Grid
          </Label>
          <Switch
            id="grid"
            checked={helpers.grid}
            onCheckedChange={() => toggleHelper('grid')}
          />
        </div>

        <div className="flex items-center justify-between py-1">
          <Label htmlFor="bounding-box" className="text-xs text-gray-300 cursor-pointer">
            Bounding Box
          </Label>
          <Switch
            id="bounding-box"
            checked={helpers.boundingBox}
            onCheckedChange={() => toggleHelper('boundingBox')}
          />
        </div>
      </div>
    </div>
  );
}

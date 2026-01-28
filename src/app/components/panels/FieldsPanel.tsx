import { useState, useEffect } from 'react';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { Slider } from '../ui/slider';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { Field } from '../../field/Field';
import { 
  getCurrentField, 
  getAllFields, 
  setCurrentField, 
  clearCurrentField,
  onCurrentFieldChange,
  onFieldRegistryChange
} from '../../state/field';
import { getManifold } from '../../state/manifold';
import { createFractalNoiseField, type FractalNoiseParams, fractalNoiseUniforms } from '../../tsl/fractalNoiseField';
import type { ColormapType } from '../../tsl/colormap';
import * as renderAPI from '../viewerWebGPU/render';

interface FieldsPanelProps {
  // No props needed - reads from global state
}

export function FieldsPanel({}: FieldsPanelProps) {
  const [currentField, setCurrentFieldState] = useState<Field | null>(null);
  const [availableFields, setAvailableFields] = useState<Field[]>([]);
  const [manifoldLoaded, setManifoldLoaded] = useState(false);
  const [isAnimating, setIsAnimating] = useState(true);
  const [fractalFieldActive, setFractalFieldActive] = useState(false);
  
  // Fractal noise parameters
  const [noiseParams, setNoiseParams] = useState<FractalNoiseParams>({
    speed: 3.0,
    amp: 1.0,
    octaves: 5,
    lacunarity: 2.0,
    gain: 0.5,
    scale: 2.0,
  });
  
  // Colormap selection
  const [selectedColormap, setSelectedColormap] = useState<ColormapType>('viridis');

  // Subscribe to field state changes
  useEffect(() => {
    // Initialize
    setCurrentFieldState(getCurrentField());
    setAvailableFields(getAllFields());
    setManifoldLoaded(getManifold() !== null);
    setFractalFieldActive(renderAPI.isFractalNoiseActive());
    setIsAnimating(renderAPI.isAnimating());

    // Listen to current field changes
    const unsubscribeCurrent = onCurrentFieldChange((field) => {
      setCurrentFieldState(field);
    });

    // Listen to registry changes
    const unsubscribeRegistry = onFieldRegistryChange((fields) => {
      setAvailableFields(fields);
    });

    // Check manifold and animation state
    const checkState = () => {
      setManifoldLoaded(getManifold() !== null);
      setFractalFieldActive(renderAPI.isFractalNoiseActive());
      setIsAnimating(renderAPI.isAnimating());
    };
    const interval = setInterval(checkState, 500);

    return () => {
      unsubscribeCurrent();
      unsubscribeRegistry();
      clearInterval(interval);
    };
  }, []);

  const handleFieldChange = (value: string) => {
    if (value === 'none') {
      clearCurrentField();
    } else {
      setCurrentField(value);
    }
  };
  
  const handleGenerateFractalNoise = () => {
    if (!manifoldLoaded) {
      return;
    }
    
    
    // Create fractal noise field
    const field = createFractalNoiseField(noiseParams);
    
    // Visualize on mesh with selected colormap
    renderAPI.setActiveField(field, {
      colormapName: selectedColormap,
      min: field.defaultRange.min,
      max: field.defaultRange.max,
    });
    
    setFractalFieldActive(true);
    setIsAnimating(true);
  };
  
  const handleStopAnimation = () => {
    renderAPI.stopAnimation();
    setIsAnimating(false);
  };
  
  const handleStartAnimation = () => {
    renderAPI.startAnimation();
    setIsAnimating(true);
  };
  
  const handleColormapChange = (value: ColormapType) => {
    setSelectedColormap(value);
    if (fractalFieldActive) {
      renderAPI.setColormapByName(value);
    }
  };
  
  const handleParamChange = (param: keyof FractalNoiseParams, value: number) => {
    const newParams = { ...noiseParams, [param]: value };
    setNoiseParams(newParams);
    
    // Always update uniform - will only affect visualization if field is active
    fractalNoiseUniforms[param].value = value;
  };

  const selectedValue = currentField?.metadata.id || 'none';

  return (
    <div className="space-y-3">
      {/* Field Selector with Tooltip */}
      <div className="space-y-2">
        <Label htmlFor="field-select" className="text-xs text-gray-300">
          Select Field
        </Label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Select 
                  value={selectedValue} 
                  onValueChange={handleFieldChange}
                  disabled={!manifoldLoaded}
                >
                  <SelectTrigger id="field-select" className="h-8 text-xs">
                    <SelectValue placeholder="Choose a field..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-xs">
                      None
                    </SelectItem>
                    {availableFields.map((field) => (
                      <SelectItem key={field.metadata.id} value={field.metadata.id} className="text-xs">
                        {field.metadata.name} ({field.metadata.valueType})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p className="text-xs">
                {manifoldLoaded
                  ? 'Select a scalar or vector field defined on the mesh'
                  : 'Load a mesh first to enable field loading'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Fractal Noise Generator */}
      <div className="space-y-3 border-t border-gray-700 pt-3">
        <Label className="text-xs text-gray-300">Fractal Noise Generator</Label>
        
        {/* Colormap Selector */}
        <div className="space-y-2">
          <Label htmlFor="colormap-select" className="text-xs text-gray-400">
            Colormap
          </Label>
          <Select 
            value={selectedColormap} 
            onValueChange={(value) => handleColormapChange(value as ColormapType)}
          >
            <SelectTrigger id="colormap-select" className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viridis" className="text-xs">Viridis</SelectItem>
              <SelectItem value="inferno" className="text-xs">Inferno</SelectItem>
              <SelectItem value="plasma" className="text-xs">Plasma</SelectItem>
              <SelectItem value="turbo" className="text-xs">Turbo</SelectItem>
              <SelectItem value="hot" className="text-xs">Hot</SelectItem>
              <SelectItem value="cool" className="text-xs">Cool</SelectItem>
              <SelectItem value="coolwarm" className="text-xs">Coolwarm</SelectItem>
              <SelectItem value="parula" className="text-xs">Parula</SelectItem>
              <SelectItem value="blackbody" className="text-xs">Blackbody</SelectItem>
              <SelectItem value="kindlmann" className="text-xs">Kindlmann</SelectItem>
              <SelectItem value="moreland" className="text-xs">Moreland</SelectItem>
              <SelectItem value="summer" className="text-xs">Summer</SelectItem>
              <SelectItem value="spring" className="text-xs">Spring</SelectItem>
              <SelectItem value="winter" className="text-xs">Winter</SelectItem>
              <SelectItem value="bone" className="text-xs">Bone</SelectItem>
              <SelectItem value="copper" className="text-xs">Copper</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {/* Parameters Grid */}
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="speed" className="text-xs text-gray-400">Speed</Label>
              <span className="text-xs text-gray-300">{noiseParams.speed?.toFixed(1)}</span>
            </div>
            <Slider
              id="speed"
              min={0.1}
              max={5}
              step={0.1}
              value={[noiseParams.speed || 3.0]}
              onValueChange={(values) => handleParamChange('speed', values[0])}
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="amp" className="text-xs text-gray-400">Amplitude</Label>
              <span className="text-xs text-gray-300">{noiseParams.amp?.toFixed(1)}</span>
            </div>
            <Slider
              id="amp"
              min={0}
              max={5}
              step={0.1}
              value={[noiseParams.amp || 1.0]}
              onValueChange={(values) => handleParamChange('amp', values[0])}
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="octaves" className="text-xs text-gray-400">Octaves</Label>
              <span className="text-xs text-gray-300">{noiseParams.octaves}</span>
            </div>
            <Slider
              id="octaves"
              min={1}
              max={10}
              step={1}
              value={[noiseParams.octaves || 5]}
              onValueChange={(values) => handleParamChange('octaves', values[0])}
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="lacunarity" className="text-xs text-gray-400">Lacunarity</Label>
              <span className="text-xs text-gray-300">{noiseParams.lacunarity?.toFixed(1)}</span>
            </div>
            <Slider
              id="lacunarity"
              min={1}
              max={4}
              step={0.1}
              value={[noiseParams.lacunarity || 2.0]}
              onValueChange={(values) => handleParamChange('lacunarity', values[0])}
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="gain" className="text-xs text-gray-400">Gain</Label>
              <span className="text-xs text-gray-300">{noiseParams.gain?.toFixed(2)}</span>
            </div>
            <Slider
              id="gain"
              min={0}
              max={1}
              step={0.05}
              value={[noiseParams.gain || 0.5]}
              onValueChange={(values) => handleParamChange('gain', values[0])}
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="scale" className="text-xs text-gray-400">Scale</Label>
              <span className="text-xs text-gray-300">{noiseParams.scale?.toFixed(1)}</span>
            </div>
            <Slider
              id="scale"
              min={0.1}
              max={10}
              step={0.1}
              value={[noiseParams.scale || 2.0]}
              onValueChange={(values) => handleParamChange('scale', values[0])}
              className="w-full"
            />
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleGenerateFractalNoise}
            disabled={!manifoldLoaded}
            className="flex-1 h-8 text-xs"
          >
            Generate
          </Button>
          <Button
            onClick={isAnimating ? handleStopAnimation : handleStartAnimation}
            disabled={!fractalFieldActive}
            variant="outline"
            className="flex-1 h-8 text-xs"
          >
            {isAnimating ? 'Stop' : 'Start'}
          </Button>
        </div>
        
        {!manifoldLoaded && (
          <p className="text-xs text-gray-500 italic text-center">
            Load a mesh first to enable field generation
          </p>
        )}
      </div>

      {/* Field Info */}
      {currentField && (
        <div className="space-y-1 text-xs text-gray-400 border-t border-gray-700 pt-2">
          <div className="flex justify-between">
            <span>Domain:</span>
            <span className="text-gray-300">{currentField.metadata.domain}</span>
          </div>
          <div className="flex justify-between">
            <span>Type:</span>
            <span className="text-gray-300">{currentField.metadata.valueType}</span>
          </div>
          <div className="flex justify-between">
            <span>Count:</span>
            <span className="text-gray-300">{currentField.metadata.count}</span>
          </div>
          {currentField.metadata.description && (
            <div className="pt-1 text-gray-400 italic">
              {currentField.metadata.description}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * EigenmodePanel.tsx
 * 
 * Control panel for eigenmode visualization
 * Allows user to select which eigenmode to visualize and control amplitude
 */

import { useState, useEffect } from 'react';
import { Label } from '../ui/label';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

export interface EigenmodeControlConfig {
  modeIndex: number;
  amplitude: number;
  useMassMatrix: boolean;
  enabled: boolean;
}

interface EigenmodePanelProps {
  config: EigenmodeControlConfig;
  onChange: (config: EigenmodeControlConfig) => void;
  maxModes: number;
  eigenvalues?: Float32Array | Float64Array; // For displaying frequency info
}

export function EigenmodePanel({ config, onChange, maxModes, eigenvalues }: EigenmodePanelProps) {
  const [localConfig, setLocalConfig] = useState(config);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const handleModeIndexChange = (value: number[]) => {
    const newConfig = { ...localConfig, modeIndex: value[0] };
    setLocalConfig(newConfig);
    onChange(newConfig);
  };

  const handleAmplitudeChange = (value: number[]) => {
    const newConfig = { ...localConfig, amplitude: value[0] };
    setLocalConfig(newConfig);
    onChange(newConfig);
  };

  const handleUseMassChange = (checked: boolean) => {
    const newConfig = { ...localConfig, useMassMatrix: checked };
    setLocalConfig(newConfig);
    onChange(newConfig);
  };

  const handleEnabledChange = (checked: boolean) => {
    const newConfig = { ...localConfig, enabled: checked };
    setLocalConfig(newConfig);
    onChange(newConfig);
  };

  const handleReset = () => {
    const resetConfig: EigenmodeControlConfig = {
      modeIndex: 0,
      amplitude: 1.0,
      useMassMatrix: false,
      enabled: true,
    };
    setLocalConfig(resetConfig);
    onChange(resetConfig);
  };

  // Get current eigenvalue (frequency)
  const currentEigenvalue = eigenvalues ? eigenvalues[localConfig.modeIndex] : null;
  const frequency = currentEigenvalue 
    ? Math.sqrt(Math.abs(currentEigenvalue)) 
    : null;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Eigenmode Visualization</CardTitle>
        <CardDescription>
          Visualize individual eigenmodes of the Laplace-Beltrami operator
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable */}
        <div className="flex items-center justify-between">
          <Label htmlFor="eigenmode-enabled">Enable Visualization</Label>
          <Switch
            id="eigenmode-enabled"
            checked={localConfig.enabled}
            onCheckedChange={handleEnabledChange}
          />
        </div>

        {localConfig.enabled && (
          <>
            {/* Mode Index Slider */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Mode Index</Label>
                <span className="text-sm text-muted-foreground">
                  {localConfig.modeIndex} / {maxModes - 1}
                </span>
              </div>
              <Slider
                value={[localConfig.modeIndex]}
                onValueChange={handleModeIndexChange}
                min={0}
                max={maxModes - 1}
                step={1}
                className="w-full"
              />
              {currentEigenvalue !== null && (
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>Eigenvalue λ: {currentEigenvalue.toExponential(3)}</div>
                  {frequency !== null && (
                    <div>Frequency ω: {frequency.toFixed(3)}</div>
                  )}
                </div>
              )}
            </div>

            {/* Amplitude Slider */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Amplitude</Label>
                <span className="text-sm text-muted-foreground">
                  {localConfig.amplitude.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[localConfig.amplitude]}
                onValueChange={handleAmplitudeChange}
                min={0.1}
                max={5.0}
                step={0.1}
                className="w-full"
              />
            </div>

            {/* Use Mass Matrix */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="use-mass-matrix">Use Mass Matrix</Label>
                <p className="text-xs text-muted-foreground">
                  Apply mass weighting to eigenfunction
                </p>
              </div>
              <Switch
                id="use-mass-matrix"
                checked={localConfig.useMassMatrix}
                onCheckedChange={handleUseMassChange}
              />
            </div>

            {/* Reset Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="w-full"
            >
              Reset to Defaults
            </Button>

            {/* Info Section */}
            <div className="pt-4 border-t space-y-2">
              <h4 className="text-sm font-medium">Mode Information</h4>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>
                  <strong>Mode {localConfig.modeIndex}:</strong>{' '}
                  {localConfig.modeIndex === 0 
                    ? 'DC component (constant)'
                    : localConfig.modeIndex < 10
                    ? 'Low frequency (global features)'
                    : localConfig.modeIndex < 100
                    ? 'Mid frequency (medium-scale patterns)'
                    : 'High frequency (fine details)'}
                </div>
                <div>
                  Total modes available: {maxModes}
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

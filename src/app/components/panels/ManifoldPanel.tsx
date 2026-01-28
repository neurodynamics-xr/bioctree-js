import React, { useState, useEffect } from 'react';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Slider } from '../ui/slider';
import { Separator } from '../ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { getManifold, onManifoldChange } from '@/app/state/manifold';
import type { Manifold } from '@/app/manifold/Manifold';

interface ManifoldPanelProps {
  onEigenmodeSelected?: (modeIndex: number) => void;
}

export function ManifoldPanel({ 
  onEigenmodeSelected 
}: ManifoldPanelProps) {
  // Manifold state
  const [manifold, setManifold] = useState<Manifold | null>(null);
  const [selectedEigenmode, setSelectedEigenmode] = useState<number | null>(null);
  const [bandRange, setBandRange] = useState<[number, number] | null>(null);

  // Display options
  const [options, setOptions] = useState({
    showNormals: false,
    showCurvature: false,
  });

  // Listen to manifold state changes
  useEffect(() => {
    // Get initial manifold
    const currentManifold = getManifold();
    setManifold(currentManifold);

    // Subscribe to changes
    const unsubscribe = onManifoldChange((newManifold) => {
      setManifold(newManifold);
      // Reset eigenmode selection when manifold changes
      setSelectedEigenmode(null);
      setBandRange(null);
    });

    return unsubscribe;
  }, []);

  // Generate eigenmode chart data from manifold
  const generateEigenmodeData = () => {
    if (!manifold?.eigenmodes) {
      return [];
    }

    const { eigenvalues, K } = manifold.eigenmodes;
    
    // Create chart data: x = eigenmode index, y = eigenvalue (lambda)
    return Array.from({ length: K }, (_, i) => ({
      index: i,
      lambda: eigenvalues[i],
    }));
  };

  const chartData = generateEigenmodeData();
  const hasEigenmodes = manifold?.eigenmodes !== undefined;

  const handleChartClick = (data: any) => {
    if (data && data.activePayload && data.activePayload.length > 0) {
      const clickedIndex = data.activePayload[0].payload.index;
      setSelectedEigenmode(clickedIndex);
      setBandRange(null);
      
      if (onEigenmodeSelected) {
        onEigenmodeSelected(clickedIndex);
      }
    }
  };

  const getSelectionText = () => {
    if (selectedEigenmode !== null) {
      const lambdaValue = manifold?.eigenmodes?.eigenvalues[selectedEigenmode];
      return `Mode ${selectedEigenmode}${lambdaValue !== undefined ? ` (λ=${lambdaValue.toFixed(6)})` : ''}`;
    }
    if (bandRange !== null) {
      return `Modes ${bandRange[0]}–${bandRange[1]}`;
    }
    if (!hasEigenmodes) {
      return 'No eigenmodes loaded';
    }
    return 'Click to select mode';
  };

  const toggleOption = (key: keyof typeof options) => {
    setOptions({ ...options, [key]: !options[key] });
  };

  return (
    <Tabs defaultValue="geometry" className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-2 bg-gray-900/50 h-7">
        <TabsTrigger value="geometry" className="text-xs py-1">
          Geometry
        </TabsTrigger>
        <TabsTrigger value="eigenmodes" className="text-xs py-1">
          Eigenmodes
        </TabsTrigger>
      </TabsList>

      <TabsContent value="geometry" className="mt-0 space-y-3">
        {/* Manifold Metadata */}
        <div className="space-y-0.5 text-xs">
          <div className="flex justify-between text-gray-400">
            <span>Name:</span>
            <span className="text-gray-200 font-mono truncate max-w-[180px]" title={manifold?.metadata.name}>
              {manifold?.metadata.name ?? '—'}
            </span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Vertices:</span>
            <span className="text-gray-200 font-mono">
              {manifold?.core.nV.toLocaleString() ?? '—'}
            </span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Faces:</span>
            <span className="text-gray-200 font-mono">
              {manifold?.core.nF.toLocaleString() ?? '—'}
            </span>
          </div>
          {manifold?.eigenmodes && (
            <div className="flex justify-between text-gray-400">
              <span>Eigenmodes:</span>
              <span className="text-gray-200 font-mono">
                {manifold.eigenmodes.K.toLocaleString()}
              </span>
            </div>
          )}
        </div>

        <Separator className="bg-gray-700" />

        {/* Manifold Options */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="show-normals" className="text-xs text-gray-300 cursor-pointer">
              Normals
            </Label>
            <Switch
              id="show-normals"
              checked={options.showNormals}
              onCheckedChange={() => toggleOption('showNormals')}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="show-curvature" className="text-xs text-gray-300 cursor-pointer">
              Curvature
            </Label>
            <Switch
              id="show-curvature"
              checked={options.showCurvature}
              onCheckedChange={() => toggleOption('showCurvature')}
            />
          </div>
        </div>
      </TabsContent>

      <TabsContent value="eigenmodes" className="mt-0 space-y-3">
        {/* Selection Display */}
        <div className="flex justify-end text-xs">
          <span className="text-gray-400 font-mono">{getSelectionText()}</span>
        </div>
        
        {/* Eigenmode Visualization Chart */}
        <div className="w-full h-40 bg-gray-900/50 rounded border border-gray-700">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 12, right: 24, bottom: 12, left: 0 }} onClick={handleChartClick}>
              <XAxis 
                dataKey="index" 
                stroke="#6B7280" 
                tick={{ fill: '#9CA3AF', fontSize: 10 }}
                tickLine={{ stroke: '#6B7280' }}
                label={{ value: 'Eigenmode Index', position: 'insideBottom', offset: -8, fill: '#9CA3AF', fontSize: 10 }}
              />
              <YAxis 
                stroke="#6B7280" 
                tick={{ fill: '#9CA3AF', fontSize: 10 }}
                tickLine={{ stroke: '#6B7280' }}
                domain={['auto', 'auto']}
                padding={{ top: 10, bottom: 10 }}
                label={{ value: 'Eigenvalue (λ)', angle: -90, position: 'insideLeft', fill: '#9CA3AF', fontSize: 10 }}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs">
                        <p className="text-gray-300">Mode {payload[0].payload.index}</p>
                        <p className="text-blue-400 font-mono">λ = {payload[0].payload.lambda.toFixed(6)}</p>
                      </div>
                    );
                  }
                  return null;
                }} 
                cursor={{ stroke: '#6B7280', strokeWidth: 1 }} 
              />
              <Line 
                type="monotone" 
                dataKey="lambda" 
                stroke="#3B82F6" 
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6, fill: '#3B82F6' }}
              />
              {selectedEigenmode !== null && selectedEigenmode !== undefined && (
                <ReferenceLine
                  x={selectedEigenmode}
                  stroke="#3B82F6"
                  strokeDasharray="3 3"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </TabsContent>
    </Tabs>
  );
}
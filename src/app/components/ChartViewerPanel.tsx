import { useState, useRef } from 'react';
import { Activity, LineChart, ChevronsRight, ChevronsLeft } from 'lucide-react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { cn } from './ui/utils';
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  BarChart,
  Bar,
  Tooltip as RechartsTooltip,
  ReferenceLine,
} from 'recharts';

interface ChartViewerPanelProps {
  className?: string;
}

// Generate mock multi-channel time-series data
const generateTimeSeriesData = (numPoints: number = 500) => {
  const data = [];
  for (let i = 0; i < numPoints; i++) {
    const t = i / numPoints;
    data.push({
      time: t,
      channel1: Math.sin(t * 20) * 0.5 + Math.random() * 0.1,
      channel2: Math.cos(t * 15) * 0.4 + Math.random() * 0.1,
      channel3: Math.sin(t * 30 + 1) * 0.3 + Math.random() * 0.1,
      channel4: Math.cos(t * 10) * 0.6 + Math.random() * 0.1,
    });
  }
  return data;
};

// Generate mock Fourier spectrum data
const generateSpectrumData = (numPoints: number = 100) => {
  const data = [];
  for (let i = 0; i < numPoints; i++) {
    const freq = i / 2;
    const amplitude = Math.exp(-i / 20) * (1 + Math.random() * 0.3);
    data.push({
      frequency: freq,
      magnitude: amplitude,
    });
  }
  return data;
};

const CHANNEL_COLORS = {
  channel1: '#3b82f6', // blue
  channel2: '#10b981', // green
  channel3: '#f59e0b', // amber
  channel4: '#ef4444', // red
};

// Generate eigenmode data for the chart (similar to ManifoldPanel)
const generateEigenmodeData = (modeNumber: number) => {
  return Array.from({ length: 51 }, (_, i) => {
    const x = (i / 50) * Math.PI * 2;
    const value = Math.sin(x * (modeNumber + 1)) * Math.exp(-x / (Math.PI * 2));
    return {
      mode: i,
      value: value,
    };
  });
};

export function ChartViewerPanel({ className }: ChartViewerPanelProps) {
  const [viewMode, setViewMode] = useState<'timeseries' | 'spectrum'>('timeseries');
  const [selectedMode, setSelectedMode] = useState<number | null>(5);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const timeSeriesData = useRef(generateTimeSeriesData()).current;
  const spectrumData = useRef(generateSpectrumData()).current;
  const eigenmodeData = generateEigenmodeData(selectedMode ?? 5);

  const handleChartClick = (data: any) => {
    if (data && data.activePayload && data.activePayload.length > 0) {
      const clickedMode = data.activePayload[0].payload.mode;
      setSelectedMode(clickedMode);
    }
  };

  const getSelectionText = () => {
    if (selectedMode !== null) {
      return `Mode ${selectedMode}`;
    }
    return 'No selection';
  };

  if (!isExpanded) {
    // Minimized - show thin vertical bar with expand button
    return (
      <div className="relative w-8 h-full bg-gray-800 border-l border-gray-700 flex flex-col items-center py-2">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsExpanded(true)}
                className="h-8 w-8 text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                aria-label="Expand chart panel"
              >
                <ChevronsLeft className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Expand Charts</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col bg-gray-900 border-l border-gray-700 w-80', className)}>
      {/* Top Division - Eigenmodes */}
      <div className="flex-1 border-b border-gray-700 bg-gray-900 flex flex-col min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between h-10 bg-gray-800 border-b border-gray-700 px-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsExpanded(false)}
                    className="h-6 w-6 text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                    aria-label="Collapse chart panel"
                  >
                    <ChevronsRight className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">Collapse Panel</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <span className="text-xs text-gray-300 font-medium">Eigenmodes</span>
          </div>
          <span className="text-xs text-gray-400 font-mono">{getSelectionText()}</span>
        </div>
        
        {/* Eigenmode Chart */}
        <div className="flex-1 px-2 py-3 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsLineChart data={eigenmodeData} margin={{ top: 8, right: 8, bottom: 8, left: -20 }} onClick={handleChartClick}>
              <XAxis 
                dataKey="mode" 
                stroke="#6B7280" 
                tick={{ fill: '#9CA3AF', fontSize: 10 }}
                tickLine={{ stroke: '#6B7280' }}
              />
              <YAxis 
                stroke="#6B7280" 
                tick={{ fill: '#9CA3AF', fontSize: 10 }}
                tickLine={{ stroke: '#6B7280' }}
                domain={['auto', 'auto']}
                padding={{ top: 10, bottom: 10 }}
              />
              <RechartsTooltip content={() => null} cursor={{ stroke: '#6B7280', strokeWidth: 1 }} />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="#3B82F6" 
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6, fill: '#3B82F6' }}
                isAnimationActive={false}
              />
              {selectedMode !== null && (
                <ReferenceLine
                  x={selectedMode}
                  stroke="#3B82F6"
                  strokeDasharray="3 3"
                />
              )}
            </RechartsLineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Middle Division - Empty for now */}
      <div className="flex-1 border-b border-gray-700 bg-gray-850">
        {/* Reserved for future use */}
      </div>

      {/* Bottom Division - Chart Viewer */}
      <div className="flex-1 flex flex-col bg-gray-900 min-h-0">
        {/* Chart Header with Tabs */}
        <div className="flex items-center justify-between h-10 bg-gray-800 border-b border-gray-700 px-3 flex-shrink-0">
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => value && setViewMode(value as 'timeseries' | 'spectrum')}
            className="bg-gray-900 rounded"
          >
            <ToggleGroupItem
              value="timeseries"
              aria-label="Time series view"
              className="h-6 px-2 text-xs data-[state=on]:bg-blue-500/20 data-[state=on]:text-blue-400"
            >
              <LineChart className="h-3 w-3 mr-1" />
              Time Series
            </ToggleGroupItem>
            <ToggleGroupItem
              value="spectrum"
              aria-label="Spectrum view"
              className="h-6 px-2 text-xs data-[state=on]:bg-blue-500/20 data-[state=on]:text-blue-400"
            >
              <Activity className="h-3 w-3 mr-1" />
              Fourier
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Chart Area */}
        <div className="flex-1 px-2 py-3 min-h-0">
          {viewMode === 'timeseries' ? (
            <ResponsiveContainer width="100%" height="100%">
              <RechartsLineChart data={timeSeriesData} margin={{ top: 8, right: 8, bottom: 8, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="time"
                  stroke="#6b7280"
                  tick={{ fill: '#9ca3af', fontSize: 10 }}
                  tickFormatter={(value) => value.toFixed(2)}
                />
                <YAxis
                  stroke="#6b7280"
                  tick={{ fill: '#9ca3af', fontSize: 10 }}
                  domain={[-1, 1]}
                />
                <Line
                  type="monotone"
                  dataKey="channel1"
                  stroke={CHANNEL_COLORS.channel1}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="channel2"
                  stroke={CHANNEL_COLORS.channel2}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="channel3"
                  stroke={CHANNEL_COLORS.channel3}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="channel4"
                  stroke={CHANNEL_COLORS.channel4}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </RechartsLineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={spectrumData} margin={{ top: 8, right: 8, bottom: 20, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="frequency"
                  stroke="#6b7280"
                  tick={{ fill: '#9ca3af', fontSize: 10 }}
                  label={{
                    value: 'Frequency (Hz)',
                    position: 'insideBottom',
                    offset: -5,
                    fill: '#9ca3af',
                    fontSize: 10,
                  }}
                />
                <YAxis
                  stroke="#6b7280"
                  tick={{ fill: '#9ca3af', fontSize: 10 }}
                  label={{
                    value: 'Magnitude',
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#9ca3af',
                    fontSize: 10,
                  }}
                />
                <Bar dataKey="magnitude" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
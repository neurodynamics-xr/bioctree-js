import React from 'react';

interface LegendProps {
  colormap: string;
  min: number;
  max: number;
  unit?: string;
}

export function Legend({ colormap, min, max, unit = '' }: LegendProps) {
  // Gradient colors based on colormap name
  const gradients = {
    viridis: 'linear-gradient(to top, #440154, #31688e, #35b779, #fde724)',
    plasma: 'linear-gradient(to top, #0d0887, #7e03a8, #cc4778, #f89540, #f0f921)',
    jet: 'linear-gradient(to top, #00007f, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000, #7f0000)',
    coolwarm: 'linear-gradient(to top, #3b4cc0, #7396f5, #b0d7f5, #f0d7c7, #f5a275, #dd513a, #b40426)',
    gray: 'linear-gradient(to top, #000000, #808080, #ffffff)',
  };

  const gradient = gradients[colormap as keyof typeof gradients] || gradients.viridis;

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-end text-xs space-y-12">
        <span className="font-mono">
          {max.toFixed(2)}
          {unit}
        </span>
        <span className="font-mono">
          {min.toFixed(2)}
          {unit}
        </span>
      </div>
      <div
        className="w-6 h-32 rounded border border-gray-300 dark:border-gray-600"
        style={{ background: gradient }}
      />
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {colormap}
      </div>
    </div>
  );
}

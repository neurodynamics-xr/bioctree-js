import React from 'react';

export function OrientationCube() {
  return (
    <div className="bg-white dark:bg-gray-800 shadow-md rounded-md p-2 w-24 h-24 flex items-center justify-center">
      <div className="relative w-20 h-20">
        {/* Simple 2D representation of 3D orientation */}
        <div className="absolute inset-0 border-2 border-gray-300 dark:border-gray-600 rounded transform rotate-45 scale-75" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-xs space-y-0.5">
            <div className="text-center text-red-600 font-medium">X</div>
            <div className="text-center text-green-600 font-medium">Y</div>
            <div className="text-center text-blue-600 font-medium">Z</div>
          </div>
        </div>
      </div>
    </div>
  );
}
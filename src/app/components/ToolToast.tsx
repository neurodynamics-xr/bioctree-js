import React from 'react';
import { Info } from 'lucide-react';

interface ToolToastProps {
  message: string;
}

export function ToolToast({ message }: ToolToastProps) {
  return (
    <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-gray-900/95 dark:bg-gray-950/95 text-white px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2 z-50 backdrop-blur-sm">
      <Info className="h-4 w-4 flex-shrink-0" />
      <span className="text-sm">{message}</span>
    </div>
  );
}

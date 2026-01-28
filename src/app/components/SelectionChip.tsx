import React from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';

interface SelectionChipProps {
  label: string;
  count: number;
  onClear: () => void;
}

export function SelectionChip({ label, count, onClear }: SelectionChipProps) {
  return (
    <div className="bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded-full px-3 py-1.5 flex items-center gap-2 text-sm shadow-sm">
      <span className="text-blue-900 dark:text-blue-100">
        ROI: {label} ({count} vertices)
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-4 w-4 p-0 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full"
        onClick={onClear}
        aria-label="Clear selection"
      >
        <X className="h-3 w-3 text-blue-700 dark:text-blue-300" />
      </Button>
    </div>
  );
}

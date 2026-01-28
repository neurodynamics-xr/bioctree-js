import React from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';

interface FieldChipProps {
  name: string;
  onClear: () => void;
}

export function FieldChip({ name, onClear }: FieldChipProps) {
  return (
    <div className="bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700 rounded-full px-3 py-1.5 flex items-center gap-2 text-sm shadow-sm">
      <span className="text-purple-900 dark:text-purple-100">
        Field: {name}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-4 w-4 p-0 hover:bg-purple-200 dark:hover:bg-purple-800 rounded-full"
        onClick={onClear}
        aria-label="Clear field"
      >
        <X className="h-3 w-3 text-purple-700 dark:text-purple-300" />
      </Button>
    </div>
  );
}

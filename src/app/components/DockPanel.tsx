import React, { useState } from 'react';
import { ChevronDown, MoreHorizontal } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from './ui/utils';

interface DockPanelProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  onToggle?: (isOpen: boolean) => void;
}

export function DockPanel({
  title,
  icon,
  children,
  defaultOpen = true,
  onToggle,
}: DockPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const handleToggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    onToggle?.(newState);
  };

  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-2 py-1.5 bg-gray-100 dark:bg-gray-800/50 hover:bg-gray-200 dark:hover:bg-gray-800/70 transition-colors">
        <button
          onClick={handleToggle}
          className="flex items-center gap-1.5 flex-1 text-left"
        >
          <ChevronDown
            className={cn(
              'h-3 w-3 text-gray-500 dark:text-gray-400 transition-transform',
              !isOpen && '-rotate-90'
            )}
          />
          {icon && <span className="text-gray-600 dark:text-gray-400">{icon}</span>}
          <span className="text-xs text-gray-800 dark:text-gray-200">{title}</span>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-700/50"
          aria-label="Panel options"
        >
          <MoreHorizontal className="h-3 w-3" />
        </Button>
      </div>

      {/* Panel Body */}
      {isOpen && (
        <div className="px-2 py-1.5 bg-gray-50 dark:bg-gray-800/30">
          {children}
        </div>
      )}
    </div>
  );
}
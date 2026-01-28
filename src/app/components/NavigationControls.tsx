import React from 'react';
import { Plus, Minus, House } from 'lucide-react';
import { Button } from './ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

export function NavigationControls() {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col items-end gap-2">
        {/* Reset View Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8 bg-white dark:bg-gray-800 shadow-md"
              aria-label="Reset view"
            >
              <House className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Reset view</p>
          </TooltipContent>
        </Tooltip>

        {/* Zoom Controls - Grouped */}
        <div className="flex flex-col bg-white dark:bg-gray-800 rounded-md shadow-md overflow-hidden">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-8 rounded-none hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Zoom in"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Zoom in</p>
            </TooltipContent>
          </Tooltip>

          {/* Divider */}
          <div className="h-px bg-gray-200 dark:bg-gray-700" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-8 rounded-none hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Zoom out"
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Zoom out</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
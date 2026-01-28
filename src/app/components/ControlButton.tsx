import React from 'react';
import { Button } from './ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

interface ControlButtonProps {
  icon: React.ReactNode;
  tooltip: string;
  onClick: () => void;
  active?: boolean;
  'aria-label'?: string;
}

export function ControlButton({
  icon,
  tooltip,
  onClick,
  active = false,
  'aria-label': ariaLabel,
}: ControlButtonProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={active ? "default" : "secondary"}
            size="icon"
            onClick={onClick}
            aria-label={ariaLabel || tooltip}
            className={`h-10 w-10 shadow-md ${active ? 'bg-primary text-primary-foreground' : 'bg-white dark:bg-gray-800'}`}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * HomeLayout.tsx
 * 
 * Main application layout for the Home page.
 * Clean, flexible layout for the primary app interface.
 */

import { cn } from '../components/ui/utils';

interface HomeLayoutProps {
  left?: React.ReactNode;
  main: React.ReactNode;
  right?: React.ReactNode;
  top?: React.ReactNode;
  bottom?: React.ReactNode;
  className?: string;
}

export function HomeLayout({
  left,
  main,
  right,
  top,
  bottom,
  className,
}: HomeLayoutProps) {
  return (
    <div className={cn('flex flex-col w-screen h-screen overflow-hidden bg-gray-100 dark:bg-gray-900', className)}>
      {/* Top region (optional - for app bar, status, etc.) */}
      {top && <div className="flex-shrink-0">{top}</div>}

      {/* Main horizontal layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Sidebar (tools, file browser, etc.) */}
        {left && <div className="flex-shrink-0">{left}</div>}

        {/* Main Content Area (viewer + overlays) */}
        <div className="relative flex-1 min-h-0 min-w-0 overflow-hidden">
          {main}
        </div>

        {/* Right Sidebar (optional - for panels, charts, etc.) */}
        {right && <div className="flex-shrink-0 h-full overflow-hidden">{right}</div>}
      </div>

      {/* Bottom region (optional - for timeline, status bar, etc.) */}
      {bottom && <div className="flex-shrink-0">{bottom}</div>}
    </div>
  );
}

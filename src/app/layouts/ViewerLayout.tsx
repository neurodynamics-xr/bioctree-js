import { cn } from '../components/ui/utils';

interface ViewerLayoutProps {
  left?: React.ReactNode;
  main: React.ReactNode;
  right?: React.ReactNode;
  top?: React.ReactNode;
  bottom?: React.ReactNode;
  toasts?: React.ReactNode;
  className?: string;
}

export function ViewerLayout({
  left,
  main,
  right,
  top,
  bottom,
  toasts,
  className,
}: ViewerLayoutProps) {
  return (
    <div className={cn('flex flex-col w-screen h-screen overflow-hidden bg-gray-100 dark:bg-gray-900', className)}>
      {/* Top region (optional) */}
      {top && <div className="flex-shrink-0">{top}</div>}

      {/* Main horizontal layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Sidebar */}
        {left && <div className="flex-shrink-0">{left}</div>}

        {/* Main Content Area */}
        <div className="relative flex-1 min-h-0 min-w-0 overflow-hidden">
          {main}
        </div>

        {/* Far Right Chart Viewer Panel */}
        {right && <div className="flex-shrink-0 h-full overflow-hidden">{right}</div>}
      </div>

      {/* Bottom region (optional) */}
      {bottom && <div className="flex-shrink-0">{bottom}</div>}

      {/* Toasts region (optional) */}
      {toasts && <div className="fixed bottom-4 right-4 z-50">{toasts}</div>}
    </div>
  );
}

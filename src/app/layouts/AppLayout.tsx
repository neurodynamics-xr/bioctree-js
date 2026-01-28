import { cn } from '../components/ui/utils';

interface AppLayoutProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * AppLayout provides the root application structure.
 * This is a simple wrapper for now but can be extended to host:
 * - Global providers (theme, auth, etc.)
 * - Global UI portals
 * - Error boundaries
 * - Consistent app-level styling
 */
export function AppLayout({ children, className }: AppLayoutProps) {
  return (
    <div className={cn('w-screen h-screen overflow-hidden', className)}>
      {children}
    </div>
  );
}

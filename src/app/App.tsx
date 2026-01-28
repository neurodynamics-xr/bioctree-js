import { useEffect, useState } from 'react';
import { AppLayout } from './layouts/AppLayout';
import { Home } from './pages/Home';
import { ExperimentalPage } from './pages/ExperimentalPage';
import { Button } from './components/ui/button';

export default function App() {
  const [page, setPage] = useState<'home' | 'experimental'>('home');
  
  // Set dark mode on mount
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <AppLayout>
      {/* Page navigation */}
      <div className="absolute top-4 left-4 z-50 flex gap-2">
        <Button
          variant={page === 'home' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPage('home')}
        >
          Home
        </Button>
        <Button
          variant={page === 'experimental' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPage('experimental')}
        >
          Experimental
        </Button>
      </div>

      {/* Render active page */}
      {page === 'home' && <Home />}
      {page === 'experimental' && <ExperimentalPage />}
    </AppLayout>
  );
}
/**
 * ExperimentalPage - A simple testing ground for developing new features
 * 
 * Use this page to experiment with:
 * - Particle visualization in Three.js
 * - New rendering techniques
 * - UI/UX prototypes
 * - Any experimental code before integrating into main viewer
 */

import { useState } from 'react';
import { SurfaceEulerianFlow } from '../components/experimental/SurfaceEulerianFlow';
import { SpectralDataTest } from '../components/experimental/spectral/SpectralDataTest';
import { TSLPractice } from '../components/experimental/TSLPractice';
import { Button } from '../components/ui/button';

type ExperimentType = 'tsl-practice' | 'particles' | 'spectral-test';

export function ExperimentalPage() {
  const [activeExperiment, setActiveExperiment] = useState<ExperimentType>('tsl-practice');

  return (
    <div className="w-full h-full bg-background text-foreground">
      {/* Experiment selector */}
      <div className="absolute top-20 right-4 z-50 flex gap-2">
        <Button
          variant={activeExperiment === 'tsl-practice' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveExperiment('tsl-practice')}
        >
          TSL Practice
        </Button>
        <Button
          variant={activeExperiment === 'particles' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveExperiment('particles')}
        >
          Particles
        </Button>
        <Button
          variant={activeExperiment === 'spectral-test' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveExperiment('spectral-test')}
        >
          Spectral Test
        </Button>
      </div>

      {/* Render active experiment */}
      {activeExperiment === 'tsl-practice' && <TSLPractice />}
      {activeExperiment === 'particles' && <SurfaceEulerianFlow />}
      
      {activeExperiment === 'spectral-test' && (
        <div className="w-full h-full flex items-center justify-center p-8">
          <SpectralDataTest />
        </div>
      )}
    </div>
  );
}

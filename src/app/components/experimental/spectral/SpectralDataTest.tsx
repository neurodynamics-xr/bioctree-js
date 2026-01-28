/**
 * Test component to verify spectral data loading
 * 
 * This component loads the bunny spectral data and displays validation results.
 * Add this to ExperimentalPage to test the data loader.
 */

import { useEffect, useState } from 'react';
import { loadBCTFromData } from '@/app/io';
import { getManifold } from '@/app/state/manifold';
import type { Manifold } from '@/app/manifold/Manifold';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';

export function SpectralDataTest() {
  const [manifold, setManifold] = useState<Manifold | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        await loadBCTFromData('bunny_spectral');
        
        const loadedManifold = getManifold();
        setManifold(loadedManifold);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Spectral Data Loader Test</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading spectral data...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full max-w-2xl border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Load Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-mono text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!spectralData) {
    return null;
  }

  // Compute some statistics
  const lambdaMin = Math.min(...Array.from(spectralData.lambda));
  const lambdaMax = Math.max(...Array.from(spectralData.lambda));
  const lambdaMean = Array.from(spectralData.lambda).reduce((a, b) => a + b, 0) / spectralData.lambda.length;

  // Sample some eigenvector values
  const sampleVertex = 0;
  const sampleMode = 0;
  const psiSample = spectralData.psi[sampleMode + spectralData.K * sampleVertex];

  // Sample gradient basis
  const sampleFace = 0;
  const gradSampleX = spectralData.gradPsi[0 + 3 * (sampleMode + spectralData.K * sampleFace)];
  const gradSampleY = spectralData.gradPsi[1 + 3 * (sampleMode + spectralData.K * sampleFace)];
  const gradSampleZ = spectralData.gradPsi[2 + 3 * (sampleMode + spectralData.K * sampleFace)];

  return (
    <div className="w-full max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Spectral Data Loaded ✓</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Metadata */}
          <div>
            <h3 className="text-sm font-medium mb-2">Metadata</h3>
            <div className="grid grid-cols-2 gap-2 text-sm font-mono">
              <div>Schema: {spectralData.schema}</div>
              <div>Version: {spectralData.version}</div>
              <div>Vertices (nV): {spectralData.nV.toLocaleString()}</div>
              <div>Faces (nF): {spectralData.nF.toLocaleString()}</div>
              <div>Eigenmodes (K): {spectralData.K}</div>
              <div>Has Boundary: {spectralData.flags.has_boundary ? 'Yes' : 'No'}</div>
            </div>
          </div>

          {/* Eigenvalue Statistics */}
          <div>
            <h3 className="text-sm font-medium mb-2">Eigenvalues (λ)</h3>
            <div className="grid grid-cols-2 gap-2 text-sm font-mono">
              <div>Min: {lambdaMin.toExponential(3)}</div>
              <div>Max: {lambdaMax.toExponential(3)}</div>
              <div>Mean: {lambdaMean.toExponential(3)}</div>
              <div>Count: {spectralData.lambda.length}</div>
            </div>
          </div>

          {/* Sample Values */}
          <div>
            <h3 className="text-sm font-medium mb-2">Sample Values</h3>
            <div className="space-y-1 text-sm font-mono">
              <div>ψ[{sampleMode}, {sampleVertex}] = {psiSample.toFixed(6)}</div>
              <div>∇ψ[0, {sampleMode}, {sampleFace}] = ({gradSampleX.toFixed(4)}, {gradSampleY.toFixed(4)}, {gradSampleZ.toFixed(4)})</div>
            </div>
          </div>

          {/* Array Sizes */}
          <div>
            <h3 className="text-sm font-medium mb-2">Array Sizes</h3>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div>V: {spectralData.vertices.length.toLocaleString()} elements</div>
              <div>F: {spectralData.faces.length.toLocaleString()} elements</div>
              <div>centroids: {spectralData.centroids.length.toLocaleString()} elements</div>
              <div>faceNormals: {spectralData.faceNormals.length.toLocaleString()} elements</div>
              <div>faceNeighbors: {spectralData.faceNeighbors.length.toLocaleString()} elements</div>
              <div>neighborEdge: {spectralData.neighborEdge.length.toLocaleString()} elements</div>
              <div>lambda: {spectralData.lambda.length.toLocaleString()} elements</div>
              <div>psi: {spectralData.psi.length.toLocaleString()} elements</div>
              <div>gradPsi: {spectralData.gradPsi.length.toLocaleString()} elements</div>
            </div>
          </div>

          {/* Layouts */}
          <div>
            <h3 className="text-sm font-medium mb-2">Data Layouts</h3>
            <div className="space-y-1 text-sm font-mono">
              <div>psi: {spectralData.layouts.psi} → psi[k,v] = psi[k + K*v]</div>
              <div>gradPsi: {spectralData.layouts.gradPsi} → grad[c,k,f] = gradPsi[c + 3*(k + K*f)]</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

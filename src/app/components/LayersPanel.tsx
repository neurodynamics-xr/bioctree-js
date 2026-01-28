import { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { Button } from './ui/button';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Slider } from './ui/slider';
import { Input } from './ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Separator } from './ui/separator';
import { Legend } from './Legend';

interface LayersPanelProps {
  onClose?: () => void;
}

export function LayersPanel({ onClose }: LayersPanelProps) {
  const [baseView, setBaseView] = useState('shaded');
  const [overlays, setOverlays] = useState({
    wireframe: false,
    edges: false,
    points: false,
    roiMask: false,
    annotations: false,
    clippingPlane: false,
  });
  const [colormap, setColormap] = useState('viridis');
  const [colorRange, setColorRange] = useState([0, 100]);
  const [autoRange, setAutoRange] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const toggleOverlay = (key: keyof typeof overlays) => {
    setOverlays({ ...overlays, [key]: !overlays[key] });
  };

  const showScalarControls = baseView === 'scalar';

  // If onClose is provided, render as floating panel
  if (onClose) {
    return (
      <div
        className="fixed top-16 right-4 w-96 max-h-[calc(100vh-80px)] bg-white dark:bg-gray-800 shadow-xl rounded-lg overflow-hidden z-40 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-medium">Field</h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
            aria-label="Close field panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {renderContent()}
        </div>
      </div>
    );
  }

  // Render as dock panel content
  function renderContent() {
    return (
      <>
        {/* Base View */}
        <div className="space-y-2">
          <Label className="text-xs text-gray-400">Base View</Label>
          <RadioGroup value={baseView} onValueChange={setBaseView}>
            <div className="grid grid-cols-2 gap-1.5">
              <RadioCard value="shaded" label="Shaded" />
              <RadioCard value="wireframe" label="Wireframe" />
              <RadioCard value="normals" label="Normals" />
              <RadioCard value="scalar" label="Scalar Field" />
              <RadioCard value="parcellation" label="Parcellation" />
            </div>
          </RadioGroup>
        </div>

        {/* Scalar Field Controls */}
        {showScalarControls && (
          <>
            <Separator className="bg-gray-700" />
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="colormap" className="text-xs text-gray-400">Colormap</Label>
                <Select value={colormap} onValueChange={setColormap}>
                  <SelectTrigger id="colormap" className="h-7 text-xs bg-gray-900/50 border-gray-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viridis">Viridis</SelectItem>
                    <SelectItem value="plasma">Plasma</SelectItem>
                    <SelectItem value="jet">Jet</SelectItem>
                    <SelectItem value="coolwarm">Coolwarm</SelectItem>
                    <SelectItem value="gray">Grayscale</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-gray-300">Range</Label>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="auto-range" className="text-xs text-gray-400">
                      Auto
                    </Label>
                    <Switch
                      id="auto-range"
                      checked={autoRange}
                      onCheckedChange={setAutoRange}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={colorRange[0]}
                    onChange={(e) => setColorRange([parseFloat(e.target.value), colorRange[1]])}
                    className="w-16 h-7 text-xs"
                    disabled={autoRange}
                  />
                  <Slider
                    value={colorRange}
                    onValueChange={setColorRange}
                    min={-100}
                    max={100}
                    step={0.1}
                    className="flex-1"
                    disabled={autoRange}
                  />
                  <Input
                    type="number"
                    value={colorRange[1]}
                    onChange={(e) => setColorRange([colorRange[0], parseFloat(e.target.value)])}
                    className="w-16 h-7 text-xs"
                    disabled={autoRange}
                  />
                </div>
              </div>

              <div className="flex justify-center pt-2">
                <Legend
                  colormap={colormap}
                  min={colorRange[0]}
                  max={colorRange[1]}
                  unit=" mm"
                />
              </div>
            </div>
          </>
        )}

        {/* Overlays */}
        <Separator className="bg-gray-700" />
        <div className="space-y-2">
          <Label className="text-xs text-gray-400">Overlays</Label>
          <div className="space-y-1">
            <ToggleRow
              label="Wireframe"
              checked={overlays.wireframe}
              onChange={() => toggleOverlay('wireframe')}
            />
            <ToggleRow
              label="Edges"
              checked={overlays.edges}
              onChange={() => toggleOverlay('edges')}
            />
            <ToggleRow
              label="Points"
              checked={overlays.points}
              onChange={() => toggleOverlay('points')}
            />
            <ToggleRow
              label="ROI Mask"
              checked={overlays.roiMask}
              onChange={() => toggleOverlay('roiMask')}
            />
            <ToggleRow
              label="Annotations"
              checked={overlays.annotations}
              onChange={() => toggleOverlay('annotations')}
            />
            <ToggleRow
              label="Clipping Plane"
              checked={overlays.clippingPlane}
              onChange={() => toggleOverlay('clippingPlane')}
            />
          </div>
        </div>

        {/* Advanced */}
        <Separator className="bg-gray-700" />
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 transition-colors"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
          />
          Advanced
        </button>

        {showAdvanced && (
          <div className="space-y-1 pl-4">
            <ToggleRow label="Two-sided lighting" checked={true} onChange={() => {}} />
            <ToggleRow label="Cast shadows" checked={false} onChange={() => {}} />
            <ToggleRow label="Ambient occlusion" checked={true} onChange={() => {}} />
          </div>
        )}
      </>
    );
  }

  return <div className="space-y-4">{renderContent()}</div>;
}

function RadioCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="relative">
      <RadioGroupItem value={value} id={value} className="peer sr-only" />
      <Label
        htmlFor={value}
        className="flex items-center justify-center h-10 text-xs border-2 border-gray-700 dark:border-gray-700 rounded-lg cursor-pointer transition-all peer-data-[state=checked]:border-blue-500 peer-data-[state=checked]:bg-blue-500/20 hover:border-gray-600 dark:hover:border-gray-600"
      >
        <span>{label}</span>
      </Label>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label htmlFor={label} className="text-xs text-gray-300 cursor-pointer">
        {label}
      </Label>
      <Switch id={label} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
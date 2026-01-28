
import { NavigationControls } from './NavigationControls';
import { OrientationCube } from './OrientationCube';
import { BrushContextMenu } from './BrushContextMenu';
import { FieldChip } from './FieldChip';
import { BrushCard } from './BrushCard';
import { LayersCard } from './LayersCard';
import type {
  BrushFamily,
  SimplexType,
  PatchType,
  BrushPatchState,
  BrushPathState,
  BrushTimeState,
} from '../types/tools';

interface ViewerControlsProps {
  hasSelection?: boolean;
  onClearSelection?: () => void;
  loadedFieldName: string | null;
  onClearField: () => void;
  brushFamily: BrushFamily;
  onBrushFamilyChange: (family: BrushFamily) => void;
  simplexType: SimplexType;
  onSimplexTypeChange: (simplexType: SimplexType) => void;
  patchType: PatchType;
  onPatchTypeChange: (patchType: PatchType) => void;
  brushPatch: BrushPatchState;
  brushPath: BrushPathState;
  brushTime: BrushTimeState;
  onBrushPatchChange: (state: BrushPatchState) => void;
  onBrushPathChange: (state: BrushPathState) => void;
  onBrushTimeChange: (state: BrushTimeState) => void;
}

export function ViewerControls({
  hasSelection,
  onClearSelection,
  loadedFieldName,
  onClearField,
  brushFamily,
  onBrushFamilyChange,
  simplexType,
  onSimplexTypeChange,
  patchType,
  onPatchTypeChange,
  brushPatch,
  brushPath,
  brushTime,
  onBrushPatchChange,
  onBrushPathChange,
  onBrushTimeChange,
}: ViewerControlsProps) {
  return (
    <div className="absolute inset-0 pointer-events-none flex items-end justify-between px-4 pb-4 z-10">
      {/* Left section: Field chip, Brush and Layers cards */}
      <div className="flex flex-col gap-2 pointer-events-auto min-w-[200px]">
        {loadedFieldName && (
          <FieldChip name={loadedFieldName} onClear={onClearField} />
        )}
        <BrushCard
          activeBrushFamily={brushFamily}
          onBrushFamilyChange={onBrushFamilyChange}
          simplexType={simplexType}
          onSimplexTypeChange={onSimplexTypeChange}
          patchType={patchType}
          onPatchTypeChange={onPatchTypeChange}
        />
        <LayersCard />
      </div>

      {/* Right: Brush Context Menu + Orientation Cube + Navigation Controls */}
      <div className="flex items-end gap-3 pointer-events-auto">
        <BrushContextMenu
          brushFamily={brushFamily}
          patchType={patchType}
          brushPatch={brushPatch}
          brushPath={brushPath}
          brushTime={brushTime}
          onBrushPatchChange={onBrushPatchChange}
          onBrushPathChange={onBrushPathChange}
          onBrushTimeChange={onBrushTimeChange}
        />
        <OrientationCube />
        <NavigationControls />
      </div>
    </div>
  );
}

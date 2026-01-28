import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Separator } from './ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState({
    lod: true,
    antialiasing: true,
    shadows: false,
    ao: true,
    theme: 'light',
  });

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings({ ...settings, [key]: !settings[key] });
  };

  return (
    <div
      className="fixed top-40 right-4 w-80 bg-white dark:bg-gray-800 shadow-xl rounded-lg overflow-hidden z-40"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="font-medium">Settings</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onClose}
          aria-label="Close settings panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="px-4 py-4 space-y-4">
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Performance</h3>
          <ToggleRow
            label="Level of Detail (LOD)"
            checked={settings.lod}
            onChange={() => toggleSetting('lod')}
          />
          <ToggleRow
            label="Antialiasing"
            checked={settings.antialiasing}
            onChange={() => toggleSetting('antialiasing')}
          />
        </div>

        <Separator />

        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Rendering</h3>
          <ToggleRow
            label="Shadows"
            checked={settings.shadows}
            onChange={() => toggleSetting('shadows')}
          />
          <ToggleRow
            label="Ambient Occlusion"
            checked={settings.ao}
            onChange={() => toggleSetting('ao')}
          />
        </div>

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="theme" className="text-sm">Theme</Label>
          <Select value={settings.theme} onValueChange={(v) => setSettings({ ...settings, theme: v })}>
            <SelectTrigger id="theme">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="auto">Auto</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
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
    <div className="flex items-center justify-between py-1">
      <Label htmlFor={label} className="text-sm cursor-pointer">
        {label}
      </Label>
      <Switch id={label} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

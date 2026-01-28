import { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { Label } from './ui/label';
import { cn } from './ui/utils';

export interface TimeSeriesState {
  isPlaying: boolean;
  currentTime: number;  // Normalized [0, 1]
  playbackSpeed: number;
}

interface TimeSeriesControlsProps {
  className?: string;
  onStateChange?: (state: TimeSeriesState) => void;
  maxTime?: number; // Maximum time in seconds (default: 10.0)
}

export function TimeSeriesControls({ 
  className, 
  onStateChange,
  maxTime = 10.0 
}: TimeSeriesControlsProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const animationFrameRef = useRef<number | undefined>(undefined);

  // Notify parent of state changes
  useEffect(() => {
    if (onStateChange) {
      onStateChange({ isPlaying, currentTime, playbackSpeed });
    }
  }, [isPlaying, currentTime, playbackSpeed, onStateChange]);

  // Playback animation
  useEffect(() => {
    if (isPlaying) {
      const animate = () => {
        setCurrentTime((prev) => {
          const next = prev + 0.001 * playbackSpeed;
          return next >= 1 ? 0 : next;
        });
        animationFrameRef.current = requestAnimationFrame(animate);
      };
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, playbackSpeed]);

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);
  const handleStop = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };
  const handleStepBack = () => {
    setCurrentTime((prev) => Math.max(0, prev - 0.01));
  };
  const handleStepForward = () => {
    setCurrentTime((prev) => Math.min(1, prev + 0.01));
  };
  const handleSkipToStart = () => {
    setCurrentTime(0);
  };
  const handleSkipToEnd = () => {
    setCurrentTime(1);
  };

  const formatTime = (t: number) => {
    const totalSeconds = t * maxTime;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frames = Math.floor((totalSeconds % 1) * 30);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  };

  return (
    <div
      className={cn(
        'flex items-center justify-between h-10 bg-gray-800/95 backdrop-blur-sm border border-gray-700 px-3 gap-4',
        className
      )}
    >
      {/* Left: Current Time */}
      <div className="flex items-center flex-shrink-0">
        <span className="text-xs text-gray-300 font-mono">{formatTime(currentTime)}</span>
      </div>

      {/* Center: Transport Controls */}
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSkipToStart}
          className="h-7 w-7 text-gray-400 hover:text-white hover:bg-gray-700"
        >
          <SkipBack className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleStepBack}
          className="h-7 w-7 text-gray-400 hover:text-white hover:bg-gray-700"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={isPlaying ? handlePause : handlePlay}
          className="h-8 w-8 text-white bg-blue-600 hover:bg-blue-700 mx-0.5"
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 ml-0.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleStop}
          className="h-7 w-7 text-gray-400 hover:text-white hover:bg-gray-700"
        >
          <Square className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleStepForward}
          className="h-7 w-7 text-gray-400 hover:text-white hover:bg-gray-700"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSkipToEnd}
          className="h-7 w-7 text-gray-400 hover:text-white hover:bg-gray-700"
        >
          <SkipForward className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Right: Playback Speed */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Label className="text-xs text-gray-400 whitespace-nowrap">Speed</Label>
        <div className="w-24">
          <Slider
            value={[playbackSpeed]}
            onValueChange={(value) => setPlaybackSpeed(value[0])}
            min={0.1}
            max={4}
            step={0.1}
            className="w-full"
          />
        </div>
        <span className="text-xs text-gray-400 w-9 text-right font-mono">{playbackSpeed.toFixed(1)}x</span>
      </div>
    </div>
  );
}
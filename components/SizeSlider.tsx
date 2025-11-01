import React from 'react';

interface SizeSliderProps {
  size: number;
  onSizeChange: (size: number) => void;
}

export const SizeSlider: React.FC<SizeSliderProps> = ({ size, onSizeChange }) => {
  return (
    <div 
      className="fixed left-4 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-3 p-3 rounded-xl bg-slate-800/80 backdrop-blur-lg border border-slate-700"
      aria-label="Tool size controller"
    >
      <div className="h-40 w-10 flex items-center justify-center">
        <input
          type="range"
          min="1"
          max="100"
          value={size}
          onChange={(e) => onSizeChange(Number(e.target.value))}
          className="w-36 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer custom-slider -rotate-90"
          aria-orientation="vertical"
          aria-valuemin={1}
          aria-valuemax={100}
          aria-valuenow={size}
        />
      </div>
       <span className="text-sm font-semibold w-8 text-center select-none" aria-live="polite">
        {size}
       </span>
    </div>
  );
};
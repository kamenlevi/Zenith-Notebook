import React, { useEffect, useRef } from 'react';
import type { CustomFont, InkTool, ToolSettings, ToolType } from '../types';
import { strokePath } from '../lib/stroke';
import { FontMenu } from './FontMenu';

/**
 * Per-tool options, shown by tapping the already-active tool.
 *
 * The old build had a permanently floating vertical slider pinned over the
 * left edge of the page — a rotated `<input type="range">` that covered the
 * writing area on an iPad and could not be dismissed. Options now live with
 * the tool they belong to, and each tool keeps its own size and colour.
 */

const SWATCHES = [
  '#111827',
  '#FFFFFF',
  '#EF4444',
  '#F97316',
  '#FACC15',
  '#22C55E',
  '#0EA5E9',
  '#6366F1',
  '#A855F7',
  '#EC4899',
];

const SIZE_RANGE: Record<InkTool | 'text', { min: number; max: number; step: number }> = {
  pen: { min: 0.5, max: 24, step: 0.5 },
  pencil: { min: 0.5, max: 24, step: 0.5 },
  highlighter: { min: 6, max: 60, step: 1 },
  eraser: { min: 6, max: 90, step: 1 },
  text: { min: 8, max: 96, step: 1 },
};

interface Props {
  tool: ToolType;
  settings: ToolSettings;
  onChange: (updater: (prev: ToolSettings) => ToolSettings) => void;
  customFonts: CustomFont[];
  onCreateFont: () => void;
  onClose: () => void;
}

export const ToolOptions: React.FC<Props> = ({
  tool,
  settings,
  onChange,
  customFonts,
  onCreateFont,
  onClose,
}) => {
  if (tool === 'select') return null;
  const key = (tool === 'text' ? 'text' : tool) as InkTool | 'text';
  const range = SIZE_RANGE[key];
  const size = settings.sizes[key];
  const color = settings.colors[key];
  const showColors = tool !== 'eraser';

  const setSize = (value: number) =>
    onChange((prev) => ({ ...prev, sizes: { ...prev.sizes, [key]: value } }));
  const setColor = (value: string) =>
    onChange((prev) => ({ ...prev, colors: { ...prev.colors, [key]: value } }));

  return (
    <div
      className="w-[min(19rem,calc(100vw-1.5rem))] rounded-xl border border-slate-700 bg-slate-900/98 p-3 shadow-2xl backdrop-blur"
      role="dialog"
      aria-label={`${tool} options`}
    >
      <StrokePreview tool={tool} size={size} color={color} />

      <label className="mt-3 block">
        <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
          <span>{tool === 'text' ? 'Font size' : 'Size'}</span>
          <span className="tabular-nums text-slate-300">
            {tool === 'text' ? `${Math.round(size)}px` : size.toFixed(1)}
          </span>
        </div>
        <input
          type="range"
          min={range.min}
          max={range.max}
          step={range.step}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          className="zn-slider w-full"
          aria-label="Tool size"
        />
      </label>

      {showColors && (
        <div className="mt-3">
          <div className="mb-1.5 text-xs text-slate-400">Colour</div>
          <div className="flex flex-wrap items-center gap-2">
            {SWATCHES.map((swatch) => (
              <button
                key={swatch}
                onClick={() => setColor(swatch)}
                aria-label={`Colour ${swatch}`}
                className={`h-7 w-7 rounded-full border transition-transform hover:scale-110 ${
                  color.toLowerCase() === swatch.toLowerCase()
                    ? 'border-white ring-2 ring-sky-400 ring-offset-2 ring-offset-slate-900'
                    : 'border-slate-600'
                }`}
                style={{ backgroundColor: swatch }}
              />
            ))}
            <label
              className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-slate-600"
              title="Custom colour"
            >
              <span
                className="absolute inset-0"
                style={{
                  background:
                    'conic-gradient(#ef4444,#f97316,#facc15,#22c55e,#0ea5e9,#6366f1,#a855f7,#ef4444)',
                }}
              />
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#000000'}
                onChange={(e) => setColor(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="Custom colour"
              />
            </label>
          </div>
        </div>
      )}

      {tool === 'eraser' && (
        <div className="mt-3">
          <div className="mb-1.5 text-xs text-slate-400">Eraser</div>
          <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-slate-950 p-1">
            {(
              [
                ['stroke', 'Whole stroke'],
                ['pixel', 'Partial'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => onChange((prev) => ({ ...prev, eraserMode: mode }))}
                className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  settings.eraserMode === mode
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
            {settings.eraserMode === 'stroke'
              ? 'Removes an entire pen stroke on contact.'
              : 'Rubs out only the part you touch.'}
          </p>
        </div>
      )}

      {tool === 'text' && (
        <div className="mt-3">
          <div className="mb-1.5 text-xs text-slate-400">Font</div>
          <FontMenu
            selectedFont={settings.fontFamily}
            onSelectFont={(fontFamily) => onChange((prev) => ({ ...prev, fontFamily }))}
            customFonts={customFonts}
            onCreateNew={() => {
              onClose();
              onCreateFont();
            }}
            fullWidth
          />
        </div>
      )}
    </div>
  );
};

/** Live sample of exactly what the current settings will draw. */
const StrokePreview: React.FC<{ tool: ToolType; size: number; color: string }> = ({
  tool,
  size,
  color,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, width, height);

    if (tool === 'text') {
      ctx.fillStyle = color;
      ctx.font = `${Math.min(size, height * 0.7)}px Lora, Georgia, serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText('Handwriting', 12, height / 2);
      return;
    }

    // A tapering S-curve, sampled with a pressure ramp so the preview shows
    // the same taper the real stroke will have.
    const points = [];
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      points.push({
        x: 12 + t * (width - 24),
        y: height / 2 + Math.sin(t * Math.PI * 1.6) * (height * 0.22),
        p: 0.25 + Math.sin(t * Math.PI) * 0.7,
      });
    }

    const path = strokePath(points, {
      tool: tool === 'eraser' ? 'pen' : (tool as InkTool),
      size,
      pressureEnabled: true,
      simulatePressure: false,
      complete: true,
    });
    ctx.globalAlpha = tool === 'highlighter' ? 0.38 : tool === 'pencil' ? 0.82 : 1;
    ctx.fillStyle = tool === 'eraser' ? '#CBD5E1' : color;
    ctx.fill(path);
  }, [tool, size, color]);

  return (
    <canvas
      ref={canvasRef}
      className="h-16 w-full rounded-lg border border-slate-700"
      aria-hidden="true"
    />
  );
};

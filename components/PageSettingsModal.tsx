import React, { useEffect, useRef, useState } from 'react';
import type { Notebook, PageBackground, PageFormat, Theme } from '../types';
import { Modal, PrimaryButton, SecondaryButton } from './Modal';
import { PAGE_FORMATS, cmToPx } from '../lib/geometry';
import { defaultLineColor, paperColor } from '../lib/render';

export interface PageStyleUpdate {
  pageFormat: PageFormat;
  pageBackground: PageBackground;
  lineSpacingCm: number;
  lineColor: string | null;
  theme: Theme;
}

interface Props {
  notebook: Notebook;
  onClose: () => void;
  onSave: (id: string, update: PageStyleUpdate) => void;
}

const FORMATS: { id: PageFormat; hint: string }[] = [
  { id: 'Letter', hint: '8.5 × 11 in' },
  { id: 'A4', hint: '210 × 297 mm' },
  { id: 'Tablet', hint: '4:3 portrait' },
  { id: 'Widescreen', hint: '16:9 landscape' },
];

const BACKGROUNDS: { id: PageBackground; label: string }[] = [
  { id: 'ruled', label: 'Ruled' },
  { id: 'grid', label: 'Grid' },
  { id: 'dotted', label: 'Dotted' },
  { id: 'custom-ruled', label: 'Custom ruled' },
  { id: 'blank', label: 'Blank' },
];

export const PageSettingsModal: React.FC<Props> = ({ notebook, onClose, onSave }) => {
  const [pageFormat, setPageFormat] = useState<PageFormat>(notebook.pageFormat);
  const [pageBackground, setPageBackground] = useState<PageBackground>(notebook.pageBackground);
  const [lineSpacingCm, setLineSpacingCm] = useState(notebook.lineSpacingCm);
  const [theme, setTheme] = useState<Theme>(notebook.theme);
  const [useCustomColor, setUseCustomColor] = useState(notebook.lineColor !== null);
  const [lineColor, setLineColor] = useState(notebook.lineColor ?? defaultLineColor(notebook.theme));

  const hasLines = pageBackground !== 'blank';

  return (
    <Modal
      title="Page style"
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex justify-end gap-3">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton
            onClick={() =>
              onSave(notebook.id, {
                pageFormat,
                pageBackground,
                lineSpacingCm: Math.max(0.2, Math.min(5, lineSpacingCm)),
                lineColor: useCustomColor && hasLines ? lineColor : null,
                theme,
              })
            }
          >
            Save
          </PrimaryButton>
        </div>
      }
    >
      <div className="grid gap-6 sm:grid-cols-[1fr_auto]">
        <div className="space-y-6">
          <section>
            <h4 className="mb-2 text-sm font-medium text-slate-400">Paper</h4>
            <div className="grid grid-cols-2 gap-2">
              {FORMATS.map(({ id, hint }) => (
                <Choice
                  key={id}
                  active={pageFormat === id}
                  onClick={() => setPageFormat(id)}
                  title={PAGE_FORMATS[id].label}
                  subtitle={hint}
                />
              ))}
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-sm font-medium text-slate-400">Lines</h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {BACKGROUNDS.map(({ id, label }) => (
                <Choice
                  key={id}
                  active={pageBackground === id}
                  onClick={() => setPageBackground(id)}
                  title={label}
                />
              ))}
            </div>
          </section>

          {pageBackground === 'custom-ruled' && (
            <section className="animate-fade-in">
              <label className="mb-2 flex items-center justify-between text-sm text-slate-400">
                <span>Line spacing</span>
                <span className="tabular-nums text-slate-300">
                  {lineSpacingCm.toFixed(1)} cm · {Math.round(cmToPx(lineSpacingCm))} px
                </span>
              </label>
              <input
                type="range"
                min={0.3}
                max={3}
                step={0.1}
                value={lineSpacingCm}
                onChange={(e) => setLineSpacingCm(Number(e.target.value))}
                className="zn-slider w-full"
              />
            </section>
          )}

          <section>
            <h4 className="mb-2 text-sm font-medium text-slate-400">Paper colour</h4>
            <div className="grid grid-cols-2 gap-2">
              <Choice active={theme === 'light'} onClick={() => setTheme('light')} title="Light" />
              <Choice active={theme === 'dark'} onClick={() => setTheme('dark')} title="Dark" />
            </div>
          </section>

          {hasLines && (
            <section className="animate-fade-in">
              <h4 className="mb-2 text-sm font-medium text-slate-400">Line colour</h4>
              <div className="flex items-center gap-3">
                <Choice
                  active={!useCustomColor}
                  onClick={() => setUseCustomColor(false)}
                  title="Automatic"
                  className="flex-1"
                />
                <Choice
                  active={useCustomColor}
                  onClick={() => setUseCustomColor(true)}
                  title="Custom"
                  className="flex-1"
                />
                <input
                  type="color"
                  value={lineColor}
                  onChange={(e) => {
                    setLineColor(e.target.value);
                    setUseCustomColor(true);
                  }}
                  className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-slate-700 bg-slate-950 p-1"
                  aria-label="Line colour"
                />
              </div>
            </section>
          )}
        </div>

        <PagePreview
          pageFormat={pageFormat}
          pageBackground={pageBackground}
          lineSpacingCm={lineSpacingCm}
          theme={theme}
          lineColor={useCustomColor && hasLines ? lineColor : null}
        />
      </div>
    </Modal>
  );
};

const Choice: React.FC<{
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  className?: string;
}> = ({ active, onClick, title, subtitle, className = '' }) => (
  <button
    onClick={onClick}
    aria-pressed={active}
    className={`rounded-lg border px-3 py-2 text-left transition-colors ${
      active
        ? 'border-sky-500 bg-sky-500/10 text-white'
        : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600 hover:bg-slate-800'
    } ${className}`}
  >
    <div className="text-sm font-medium">{title}</div>
    {subtitle && <div className="text-[11px] text-slate-500">{subtitle}</div>}
  </button>
);

/** Live thumbnail so the settings are not guesswork. */
const PagePreview: React.FC<{
  pageFormat: PageFormat;
  pageBackground: PageBackground;
  lineSpacingCm: number;
  theme: Theme;
  lineColor: string | null;
}> = ({ pageFormat, pageBackground, lineSpacingCm, theme, lineColor }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = PAGE_FORMATS[pageFormat];
  const boxWidth = 168;
  const boxHeight = Math.round((boxWidth * size.height) / size.width);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = boxWidth * dpr;
    canvas.height = boxHeight * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = paperColor(theme);
    ctx.fillRect(0, 0, boxWidth, boxHeight);

    const scale = boxWidth / size.width;
    ctx.strokeStyle = lineColor ?? defaultLineColor(theme);
    ctx.fillStyle = lineColor ?? defaultLineColor(theme);
    ctx.lineWidth = 1;

    const spacing =
      pageBackground === 'custom-ruled'
        ? cmToPx(lineSpacingCm) * scale
        : pageBackground === 'ruled'
          ? 32 * scale
          : 28 * scale;

    if (pageBackground === 'ruled' || pageBackground === 'custom-ruled') {
      for (let y = spacing; y < boxHeight; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(boxWidth, y);
        ctx.stroke();
      }
    } else if (pageBackground === 'grid') {
      for (let y = spacing; y < boxHeight; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(boxWidth, y);
        ctx.stroke();
      }
      for (let x = spacing; x < boxWidth; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, boxHeight);
        ctx.stroke();
      }
    } else if (pageBackground === 'dotted') {
      for (let y = spacing; y < boxHeight; y += spacing) {
        for (let x = spacing; x < boxWidth; x += spacing) {
          ctx.beginPath();
          ctx.arc(x, y, 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }, [pageFormat, pageBackground, lineSpacingCm, theme, lineColor, boxWidth, boxHeight, size]);

  return (
    <div className="hidden shrink-0 sm:block">
      <div className="mb-2 text-sm font-medium text-slate-400">Preview</div>
      <canvas
        ref={canvasRef}
        style={{ width: boxWidth, height: boxHeight }}
        className="rounded-lg border border-slate-700 shadow-lg"
      />
      <div className="mt-2 text-[11px] tabular-nums text-slate-500">
        {size.width} × {size.height} px
      </div>
    </div>
  );
};

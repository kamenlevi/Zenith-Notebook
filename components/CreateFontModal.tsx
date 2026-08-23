import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CustomFont, StrokePoint } from '../types';
import { Modal, PrimaryButton, SecondaryButton } from './Modal';
import { XIcon } from './Icons';
import { FONT_CHARSET, GLYPH_CANVAS, invalidateGlyphAtlas } from '../lib/customFont';
import { strokePath } from '../lib/stroke';

interface Props {
  onClose: () => void;
  onSave: (font: { id?: string; name: string; characters: Record<string, string> }) => void;
  editing?: CustomFont | null;
}

const GROUPS: { label: string; chars: string[] }[] = [
  { label: 'A–Z', chars: FONT_CHARSET.filter((c) => /[A-Z]/.test(c)) },
  { label: 'a–z', chars: FONT_CHARSET.filter((c) => /[a-z]/.test(c)) },
  { label: '0–9', chars: FONT_CHARSET.filter((c) => /[0-9]/.test(c)) },
  { label: 'Marks', chars: FONT_CHARSET.filter((c) => !/[A-Za-z0-9]/.test(c)) },
];

export const CreateFontModal: React.FC<Props> = ({ onClose, onSave, editing }) => {
  const [name, setName] = useState(editing?.name ?? '');
  const [characters, setCharacters] = useState<Record<string, string>>(
    () => ({ ...(editing?.characters ?? {}) }),
  );
  const [group, setGroup] = useState(0);

  const handleGlyph = useCallback((char: string, dataUrl: string | null) => {
    setCharacters((prev) => {
      const next = { ...prev };
      if (dataUrl) next[char] = dataUrl;
      else delete next[char];
      return next;
    });
  }, []);

  const drawnCount = Object.keys(characters).length;
  const canSave = name.trim().length > 0 && drawnCount > 0;

  const activeChars = GROUPS[group].chars;
  const groupCounts = useMemo(
    () => GROUPS.map((g) => g.chars.filter((c) => characters[c]).length),
    [characters],
  );

  return (
    <Modal
      title={editing ? `Edit "${editing.name}"` : 'Draw your own font'}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-slate-500">
            {drawnCount} of {FONT_CHARSET.length} characters drawn
          </span>
          <div className="flex gap-3">
            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
            <PrimaryButton
              disabled={!canSave}
              onClick={() => {
                if (editing) invalidateGlyphAtlas(editing.id);
                onSave({ id: editing?.id, name: name.trim(), characters });
              }}
            >
              {editing ? 'Save changes' : 'Save font'}
            </PrimaryButton>
          </div>
        </div>
      }
    >
      <label className="block">
        <span className="mb-2 block text-sm text-slate-400">Font name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. My handwriting"
          className="w-full max-w-xs rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-sky-500"
        />
      </label>

      <p className="mt-4 text-sm text-slate-400">
        Draw each character sitting on the solid baseline, with capitals reaching the dashed line.
        Characters you skip simply fall back to a standard font.
      </p>

      <div className="mt-4 flex flex-wrap gap-1 rounded-lg bg-slate-950 p-1">
        {GROUPS.map((g, i) => (
          <button
            key={g.label}
            onClick={() => setGroup(i)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              group === i ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {g.label}
            <span className="ml-1.5 text-[11px] text-slate-500">
              {groupCounts[i]}/{g.chars.length}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
        {activeChars.map((char) => (
          <GlyphPad
            key={char}
            character={char}
            initial={characters[char]}
            onChange={handleGlyph}
          />
        ))}
      </div>
    </Modal>
  );
};

/**
 * One character canvas.
 *
 * The guides used to be painted onto this canvas before `toDataURL()`, so the
 * baseline and cap-height bars ended up inside every exported glyph — the
 * reason hand-drawn fonts rendered with grey stripes through them. They are
 * now DOM elements layered behind the canvas and never reach the bitmap.
 */
const GlyphPad = memo(
  ({
    character,
    initial,
    onChange,
  }: {
    character: string;
    initial?: string;
    onChange: (char: string, dataUrl: string | null) => void;
  }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const strokesRef = useRef<StrokePoint[][]>([]);
    const currentRef = useRef<StrokePoint[] | null>(null);
    const [hasInk, setHasInk] = useState(Boolean(initial));

    const redraw = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#FFFFFF';
      const all = currentRef.current
        ? [...strokesRef.current, currentRef.current]
        : strokesRef.current;
      for (const points of all) {
        if (points.length === 0) continue;
        ctx.fill(
          strokePath(points, {
            tool: 'pen',
            size: 22,
            pressureEnabled: false,
            simulatePressure: false,
            complete: true,
          }),
        );
      }
    }, []);

    // Load an existing glyph so editing a font does not start from blank.
    useEffect(() => {
      if (!initial) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = initial;
      // Only on mount: later updates come from this pad's own drawing.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>): StrokePoint => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      // Scale from CSS pixels to the canvas's internal resolution. The old
      // code multiplied offsetX by a hardcoded 4, which broke as soon as the
      // element was laid out at any other size.
      return {
        x: ((event.clientX - rect.left) / rect.width) * canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * canvas.height,
        p: 0.5,
      };
    };

    const commit = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ink = strokesRef.current.length > 0;
      setHasInk(ink);
      onChange(character, ink ? canvas.toDataURL('image/png') : null);
    };

    const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      canvasRef.current?.setPointerCapture(event.pointerId);
      currentRef.current = [toCanvasPoint(event)];
      redraw();
    };

    const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!currentRef.current) return;
      event.preventDefault();
      currentRef.current.push(toCanvasPoint(event));
      redraw();
    };

    const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!currentRef.current) return;
      try {
        canvasRef.current?.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
      if (currentRef.current.length > 0) strokesRef.current.push(currentRef.current);
      currentRef.current = null;
      redraw();
      commit();
    };

    const undoStroke = () => {
      strokesRef.current.pop();
      redraw();
      commit();
    };

    const clear = () => {
      strokesRef.current = [];
      currentRef.current = null;
      redraw();
      commit();
    };

    const baselinePercent = (GLYPH_CANVAS.baseline / GLYPH_CANVAS.height) * 100;
    const capPercent = (GLYPH_CANVAS.capLine / GLYPH_CANVAS.height) * 100;

    return (
      <div className="flex flex-col items-center">
        <div className="relative">
          {/* Guides live outside the bitmap. */}
          <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-md">
            <div
              className="absolute inset-x-0 border-t border-dashed border-slate-500/60"
              style={{ top: `${capPercent}%` }}
            />
            <div
              className="absolute inset-x-0 border-t border-sky-400/70"
              style={{ top: `${baselinePercent}%` }}
            />
          </div>
          <canvas
            ref={canvasRef}
            width={GLYPH_CANVAS.width}
            height={GLYPH_CANVAS.height}
            style={{ width: 80, height: 100 }}
            className={`touch-none rounded-md border bg-slate-950 ${
              hasInk ? 'border-sky-600' : 'border-slate-700'
            }`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          {hasInk && (
            <div className="absolute right-1 top-1 z-20 flex gap-1">
              <button
                onClick={undoStroke}
                className="rounded bg-slate-800/90 px-1 text-[10px] text-slate-200 hover:bg-slate-700"
                aria-label={`Undo last stroke for ${character}`}
              >
                ↺
              </button>
              <button
                onClick={clear}
                className="rounded bg-slate-800/90 p-0.5 text-slate-200 hover:bg-slate-700"
                aria-label={`Clear ${character}`}
              >
                <XIcon className="h-2.5 w-2.5" />
              </button>
            </div>
          )}
        </div>
        <span className="mt-1 text-sm font-semibold text-slate-400">{character}</span>
      </div>
    );
  },
);

GlyphPad.displayName = 'GlyphPad';

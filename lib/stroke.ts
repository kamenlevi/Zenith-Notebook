/**
 * Stroke geometry.
 *
 * The old renderer called `ctx.stroke()` on a mid-point quadratic path with a
 * constant `lineWidth`. That produces a dead-flat line with no pressure, no
 * taper and visible corner artefacts — the single biggest reason handwriting
 * looked wrong.
 *
 * Instead we build a variable-width outline polygon per stroke (via
 * perfect-freehand) and fill it. Width responds to stylus pressure, and for
 * mouse/finger input — which reports no useful pressure — to velocity, so
 * fast strokes thin out the way a real pen does.
 */

import getStroke from 'perfect-freehand';
import type { StrokeOptions } from 'perfect-freehand';
import type { InkTool, StrokePoint } from '../types';

export interface StrokeStyleOptions {
  tool: InkTool;
  size: number;
  /** Whether reported stylus pressure should modulate width. */
  pressureEnabled: boolean;
  /** True when the input device reports real pressure (Apple Pencil, etc). */
  hasRealPressure: boolean;
  /** False while the stroke is still being drawn, so the end cap stays open. */
  complete?: boolean;
}

type FreehandOptions = Required<
  Pick<
    StrokeOptions,
    'size' | 'thinning' | 'smoothing' | 'streamline' | 'simulatePressure' | 'easing' | 'start' | 'end' | 'last'
  >
>;

const linear = (t: number) => t;
const easeOutSine = (t: number) => Math.sin((t * Math.PI) / 2);
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/**
 * Per-tool feel. `thinning` is how much pressure changes width, `streamline`
 * is how aggressively raw input is smoothed toward the cursor (this is what
 * removes hand jitter), `taper` shapes the entry and exit of a stroke.
 */
export const freehandOptions = ({
  tool,
  size,
  pressureEnabled,
  hasRealPressure,
  complete = true,
}: StrokeStyleOptions): FreehandOptions => {
  // Without a stylus there is no pressure signal, so let perfect-freehand
  // derive one from velocity rather than flattening the stroke entirely.
  const simulatePressure = !hasRealPressure;
  const respondsToPressure = pressureEnabled || simulatePressure;

  switch (tool) {
    case 'pen':
      return {
        size,
        thinning: respondsToPressure ? 0.55 : 0,
        smoothing: 0.55,
        streamline: 0.42,
        simulatePressure,
        easing: easeOutSine,
        start: { taper: size * 1.5, cap: true, easing: easeOutSine },
        end: { taper: size * 2.5, cap: true, easing: easeOutSine },
        last: complete,
      };
    case 'pencil':
      // A pencil is grainier and less pressure-reactive than a pen, and its
      // tip is blunt, so barely any taper.
      return {
        size,
        thinning: respondsToPressure ? 0.35 : 0,
        smoothing: 0.4,
        streamline: 0.35,
        simulatePressure,
        easing: easeInOutSine,
        start: { taper: 0, cap: true, easing: linear },
        end: { taper: 0, cap: true, easing: linear },
        last: complete,
      };
    case 'highlighter':
      // A chisel tip is deliberately uniform — pressure must not affect it,
      // or overlapping passes band unevenly.
      return {
        size,
        thinning: 0,
        smoothing: 0.5,
        streamline: 0.5,
        simulatePressure: false,
        easing: linear,
        start: { taper: 0, cap: false, easing: linear },
        end: { taper: 0, cap: false, easing: linear },
        last: complete,
      };
    case 'eraser':
      return {
        size,
        thinning: 0,
        smoothing: 0.5,
        streamline: 0.4,
        simulatePressure: false,
        easing: linear,
        start: { taper: 0, cap: true, easing: linear },
        end: { taper: 0, cap: true, easing: linear },
        last: complete,
      };
  }
};

export type OutlinePoint = number[];

/** Build the outline polygon for a stroke. */
export const strokeOutline = (
  points: StrokePoint[],
  style: StrokeStyleOptions,
): OutlinePoint[] => {
  if (points.length === 0) return [];
  const input = points.map((p) => [p.x, p.y, p.p] as [number, number, number]);
  return getStroke(input, freehandOptions(style)) as OutlinePoint[];
};

/**
 * Turn an outline into a Path2D using quadratic segments through the midpoints,
 * which keeps the silhouette smooth instead of faceted.
 */
export const outlineToPath = (outline: OutlinePoint[]): Path2D => {
  const path = new Path2D();
  const len = outline.length;
  if (len === 0) return path;
  if (len < 3) {
    // Degenerate: a dot.
    const [x, y] = outline[0];
    path.moveTo(x, y);
    path.arc(x, y, 0.5, 0, Math.PI * 2);
    return path;
  }

  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 0; i < len; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % len];
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  path.closePath();
  return path;
};

export const strokePath = (points: StrokePoint[], style: StrokeStyleOptions): Path2D =>
  outlineToPath(strokeOutline(points, style));

/**
 * Normalise a PointerEvent's pressure.
 *
 * Browsers report 0 for devices with no pressure sensor and — annoyingly —
 * also report exactly 0.5 for mouse buttons and for some trackpads, so a raw
 * reading of 0.5 from a non-pen device must not be trusted as "real".
 */
export const readPressure = (event: PointerEvent): number => {
  if (event.pointerType !== 'pen') return 0.5;
  const raw = event.pressure;
  if (!Number.isFinite(raw) || raw <= 0) return 0.5;
  return Math.max(0.02, Math.min(1, raw));
};

export const isPressureCapable = (event: PointerEvent): boolean =>
  event.pointerType === 'pen' && Number.isFinite(event.pressure) && event.pressure > 0;

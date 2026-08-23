import type { Bounds, Notebook, NoteObject, PageFormat, StrokeObject } from '../types';

/** Screen pixels per CSS inch. Everything on the page is sized off this. */
export const DPI = 96;
const CM_PER_INCH = 2.54;

export const cmToPx = (cm: number) => (cm / CM_PER_INCH) * DPI;
export const pxToCm = (px: number) => (px / DPI) * CM_PER_INCH;

export interface PageSize {
  width: number;
  height: number;
  label: string;
}

/**
 * Real page dimensions at 96dpi. The old build hardcoded US Letter everywhere
 * and silently ignored this setting entirely.
 */
export const PAGE_FORMATS: Record<PageFormat, PageSize> = {
  Letter: { width: 816, height: 1056, label: 'US Letter' },
  A4: { width: 794, height: 1123, label: 'A4' },
  Tablet: { width: 768, height: 1024, label: 'Tablet 4:3' },
  Widescreen: { width: 1280, height: 720, label: 'Widescreen 16:9' },
};

/** Vertical space between pages in the scrolling world. */
export const PAGE_GAP = 28;

/** Default left/right text margin on a page. */
export const PAGE_MARGIN = 48;

export const getPageSize = (format: PageFormat): PageSize =>
  PAGE_FORMATS[format] ?? PAGE_FORMATS.Letter;

export const getPageTop = (format: PageFormat, index: number) =>
  index * (getPageSize(format).height + PAGE_GAP);

export const getTotalHeight = (format: PageFormat, pageCount: number) => {
  if (pageCount <= 0) return 0;
  const { height } = getPageSize(format);
  return pageCount * height + (pageCount - 1) * PAGE_GAP;
};

/** Which page a world-space Y lands on, clamped to the notebook. */
export const pageIndexAt = (notebook: Notebook, worldY: number) => {
  const { height } = getPageSize(notebook.pageFormat);
  const stride = height + PAGE_GAP;
  return Math.max(0, Math.min(notebook.pageCount - 1, Math.floor(worldY / stride)));
};

/**
 * Distance between ruled lines for the notebook's background style,
 * or 0 when the background has no lines to snap to.
 */
export const getLineHeight = (notebook: Notebook): number => {
  switch (notebook.pageBackground) {
    case 'ruled':
      return 32;
    case 'grid':
    case 'dotted':
      return 28;
    case 'custom-ruled':
      return Math.max(8, cmToPx(notebook.lineSpacingCm));
    default:
      return 0;
  }
};

/* ------------------------------------------------------------------ */
/* Bounds                                                              */
/* ------------------------------------------------------------------ */

export const EMPTY_BOUNDS: Bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

export const boundsFromRect = (x: number, y: number, w: number, h: number): Bounds => ({
  minX: x,
  minY: y,
  maxX: x + w,
  maxY: y + h,
});

export const inflateBounds = (b: Bounds, by: number): Bounds => ({
  minX: b.minX - by,
  minY: b.minY - by,
  maxX: b.maxX + by,
  maxY: b.maxY + by,
});

export const boundsIntersect = (a: Bounds, b: Bounds) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

export const boundsContainPoint = (b: Bounds, x: number, y: number) =>
  x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;

export const unionBounds = (list: Bounds[]): Bounds | null => {
  if (list.length === 0) return null;
  let { minX, minY, maxX, maxY } = list[0];
  for (let i = 1; i < list.length; i++) {
    const b = list[i];
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  return { minX, minY, maxX, maxY };
};

/** Recompute the cached bounds of a stroke from its points. */
export const strokeBounds = (stroke: Pick<StrokeObject, 'points' | 'size'>): Bounds => {
  const pts = stroke.points;
  if (pts.length === 0) return { ...EMPTY_BOUNDS };
  let minX = pts[0].x;
  let minY = pts[0].y;
  let maxX = pts[0].x;
  let maxY = pts[0].y;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const pad = stroke.size / 2 + 2;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
};

export const objectBounds = (obj: NoteObject): Bounds => obj.bounds;

/** Move an object's cached bounds without recomputing them. */
export const translateBounds = (b: Bounds, dx: number, dy: number): Bounds => ({
  minX: b.minX + dx,
  minY: b.minY + dy,
  maxX: b.maxX + dx,
  maxY: b.maxY + dy,
});

/* ------------------------------------------------------------------ */
/* Segment maths (used for stroke hit-testing and the ruler)           */
/* ------------------------------------------------------------------ */

/** Squared distance from point (px,py) to segment (ax,ay)-(bx,by). */
export const distanceToSegmentSq = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number => {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy);
};

/** Project a point onto the infinite line through (ax,ay) at `angle`. */
export const projectOntoLine = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  angle: number,
) => {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const t = (px - ax) * dx + (py - ay) * dy;
  return { x: ax + t * dx, y: ay + t * dy, distance: Math.abs((px - ax) * dy - (py - ay) * dx) };
};

/** Even-odd point-in-polygon, for lasso selection. */
export const pointInPolygon = (
  px: number,
  py: number,
  poly: { x: number; y: number }[],
): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
};

export const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

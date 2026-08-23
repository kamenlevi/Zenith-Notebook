/**
 * Notebook construction, hydration and the v1 -> v2 migration.
 */

import type {
  CustomFont,
  Notebook,
  NoteObject,
  StrokeObject,
  TextObject,
  ToolSettings,
} from '../types';
import { strokeBounds } from './geometry';
import { textBounds } from './text';
import { uid } from './id';
import { putAsset } from './storage';

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  tool: 'pen',
  colors: {
    pen: '#111827',
    pencil: '#4B5563',
    highlighter: '#FACC15',
    eraser: '#000000',
    text: '#111827',
  },
  sizes: {
    pen: 3,
    pencil: 3.5,
    highlighter: 22,
    eraser: 26,
    text: 20,
  },
  fontFamily: 'Lora',
  eraserMode: 'stroke',
  fingerDraws: false,
};

export const createNotebook = (name: string, overrides: Partial<Notebook> = {}): Notebook => ({
  id: uid('nb'),
  name: name.trim() || 'Untitled',
  objects: [],
  pageCount: 5,
  theme: 'light',
  pageFormat: 'Letter',
  pageBackground: 'ruled',
  lineSpacingCm: 0.8,
  lineColor: null,
  updatedAt: Date.now(),
  ...overrides,
});

/**
 * Recompute derived data after loading. Bounds are cached in the document for
 * render culling, but text bounds depend on font metrics that only exist at
 * runtime, so they are always recalculated.
 */
export const hydrateNotebook = (notebook: Notebook, customFonts: CustomFont[]): Notebook => {
  const objects = notebook.objects.map((obj): NoteObject => {
    if (obj.kind === 'stroke') {
      const points = Array.isArray(obj.points) ? obj.points : [];
      return { ...obj, points, bounds: obj.bounds ?? strokeBounds({ points, size: obj.size }) };
    }
    if (obj.kind === 'text') {
      return { ...obj, bounds: textBounds(obj, customFonts) };
    }
    return {
      ...obj,
      bounds: {
        minX: obj.x,
        minY: obj.y,
        maxX: obj.x + obj.width,
        maxY: obj.y + obj.height,
      },
    };
  });
  return { ...notebook, objects };
};

/* ------------------------------------------------------------------ */
/* v1 migration                                                        */
/* ------------------------------------------------------------------ */

const LEGACY_PAGE_HEIGHT = 1056;
const LEGACY_PAGE_GAP = 24;
const NEW_PAGE_GAP = 28;

/** Old pages were 24px apart; shift content to match the new 28px gap. */
const remapY = (y: number): number => {
  const index = Math.floor(y / (LEGACY_PAGE_HEIGHT + LEGACY_PAGE_GAP));
  const offsetInPage = y - index * (LEGACY_PAGE_HEIGHT + LEGACY_PAGE_GAP);
  return index * (LEGACY_PAGE_HEIGHT + NEW_PAGE_GAP) + offsetInPage;
};

const dataUrlToBlob = async (dataUrl: string): Promise<Blob | null> => {
  try {
    const response = await fetch(dataUrl);
    return await response.blob();
  } catch {
    return null;
  }
};

/**
 * Convert one v1 "subject" into a v2 notebook.
 *
 * The v1 model kept freehand paths with a `globalCompositeOperation` field and
 * no pressure, text anchored to its *baseline*, and images inline as base64
 * data URLs on the subject itself.
 */
export const migrateLegacySubject = async (legacy: any): Promise<Notebook> => {
  const objects: NoteObject[] = [];

  const canvasState = Array.isArray(legacy?.canvasState) ? legacy.canvasState : [];
  for (const item of canvasState) {
    if (!item || typeof item !== 'object') continue;

    if (item.tool === 'text') {
      const fontSize = Number(item.fontSize) || 18;
      const text: TextObject = {
        kind: 'text',
        id: uid('text'),
        text: String(item.text ?? ''),
        x: Number(item.x) || 0,
        // v1 drew text with textBaseline 'bottom', so its y was the baseline
        // of the first line. The new model anchors to the top-left.
        y: remapY(Number(item.y) || 0) - fontSize,
        width: 640,
        fontSize,
        fontFamily: typeof item.fontFamily === 'string' ? item.fontFamily : 'Lora',
        color: typeof item.color === 'string' ? item.color : '#111827',
        bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      };
      if (text.text.trim()) objects.push(text);
      continue;
    }

    const rawPoints = Array.isArray(item.points) ? item.points : [];
    if (rawPoints.length === 0) continue;
    const points = rawPoints
      .filter((p: any) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
      .map((p: any) => ({ x: Number(p.x), y: remapY(Number(p.y)), p: 0.5 }));
    if (points.length === 0) continue;

    const legacyTool: string = item.tool ?? 'pen';
    const tool =
      legacyTool === 'eraser' || item.globalCompositeOperation === 'destination-out'
        ? 'eraser'
        : legacyTool === 'highlighter'
          ? 'highlighter'
          : legacyTool === 'pencil'
            ? 'pencil'
            : 'pen';

    // v1 stroke sizes came from a quadratic slider curve and were already in
    // world pixels, so they carry over directly.
    const size = Math.max(0.5, Number(item.size) || 3);
    const stroke: StrokeObject = {
      kind: 'stroke',
      id: uid('stroke'),
      tool,
      color: typeof item.color === 'string' ? item.color : '#111827',
      size,
      opacity:
        tool === 'highlighter' ? 0.38 : tool === 'pencil' ? 0.82 : Number(item.globalAlpha) || 1,
      points,
      bounds: strokeBounds({ points, size }),
    };
    objects.push(stroke);
  }

  const legacyImages = Array.isArray(legacy?.images) ? legacy.images : [];
  for (const img of legacyImages) {
    if (!img?.src || typeof img.src !== 'string') continue;
    const width = Number(img.width) || 200;
    const height = Number(img.height) || 200;
    const x = Number(img.x) || 0;
    const y = remapY(Number(img.y) || 0);

    // Move the base64 payload out of the document and into the asset store.
    let src = img.src;
    if (src.startsWith('data:')) {
      const blob = await dataUrlToBlob(src);
      if (blob) {
        const assetId = uid('img');
        try {
          await putAsset(assetId, blob);
          src = assetId;
        } catch {
          // Keep the data URL inline if the asset store rejected it; the
          // notebook still renders, it just takes more space.
        }
      }
    }

    objects.push({
      kind: 'image',
      id: uid('image'),
      src,
      x,
      y,
      width,
      height,
      bounds: { minX: x, minY: y, maxX: x + width, maxY: y + height },
    });
  }

  return createNotebook(typeof legacy?.name === 'string' ? legacy.name : 'Imported', {
    objects,
    pageCount: Math.max(1, Math.min(500, Number(legacy?.pageCount) || 5)),
    theme: legacy?.theme === 'dark' ? 'dark' : 'light',
    pageFormat: ['Letter', 'A4', 'Tablet', 'Widescreen'].includes(legacy?.pageFormat)
      ? legacy.pageFormat
      : 'Letter',
    pageBackground: ['ruled', 'grid', 'dotted', 'custom-ruled', 'blank'].includes(
      legacy?.pageBackground,
    )
      ? legacy.pageBackground
      : 'ruled',
    lineSpacingCm: Number(legacy?.lineSpacingCm) || 0.8,
    lineColor: typeof legacy?.lineColor === 'string' ? legacy.lineColor : null,
  });
};

/**
 * Scene rendering.
 *
 * Two structural fixes over the previous renderer:
 *
 *  1. **Vector, not raster.** It used to draw the whole notebook once into an
 *     816px-wide offscreen canvas and then `drawImage` that bitmap through the
 *     zoom transform — so zooming in showed magnified pixels. Handwriting was
 *     unreadable above ~150%. We now apply the transform to the context and
 *     re-draw the vectors, so every zoom level is natively crisp.
 *
 *  2. **Ink lives on its own layer.** The eraser used `destination-out`
 *     directly on the canvas holding the paper, so erasing punched transparent
 *     holes clean through the page. Objects render into a separate content
 *     layer that is composited over the paper, so the eraser can only remove
 *     ink, images and text.
 */

import type { Bounds, CustomFont, Notebook, NoteObject, StrokeObject, TextObject, Theme } from '../types';
import {
  PAGE_GAP,
  boundsIntersect,
  cmToPx,
  getPageSize,
  getTotalHeight,
} from './geometry';
import { peekImage, requestImage } from './imageCache';
import { strokePath } from './stroke';
import { cssFont, layoutText, lineHeightFor } from './text';
import { glyphAdvance, glyphScale, peekGlyphAtlas, tintedGlyph } from './customFont';

export const paperColor = (theme: Theme) => (theme === 'light' ? '#FFFFFF' : '#16181D');
export const defaultLineColor = (theme: Theme) =>
  theme === 'light' ? '#D7DEE8' : '#333842';
export const pageShadowColor = (theme: Theme) =>
  theme === 'light' ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.6)';

/** Canvas colour for the area around the pages. */
export const deskColor = (theme: Theme) => (theme === 'light' ? '#4B5563' : '#0A0B0D');

export interface Viewport {
  scale: number;
  offsetX: number;
  offsetY: number;
  /** CSS pixel size of the drawing surface. */
  width: number;
  height: number;
}

/** World-space rectangle currently visible. */
export const visibleBounds = (vp: Viewport): Bounds => ({
  minX: -vp.offsetX / vp.scale,
  minY: -vp.offsetY / vp.scale,
  maxX: (-vp.offsetX + vp.width) / vp.scale,
  maxY: (-vp.offsetY + vp.height) / vp.scale,
});

/** Apply the world transform to a context already scaled for devicePixelRatio. */
export const applyViewport = (ctx: CanvasRenderingContext2D, vp: Viewport) => {
  ctx.translate(vp.offsetX, vp.offsetY);
  ctx.scale(vp.scale, vp.scale);
};

/* ------------------------------------------------------------------ */
/* Page backgrounds                                                    */
/* ------------------------------------------------------------------ */

export interface PageBackgroundOptions {
  /** Draw the drop shadow around each sheet. Off for print/PDF export. */
  shadow?: boolean;
}

const drawRuledLines = (
  ctx: CanvasRenderingContext2D,
  notebook: Notebook,
  pageTop: number,
  width: number,
  height: number,
  color: string,
) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;

  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  switch (notebook.pageBackground) {
    case 'ruled': {
      const spacing = 32;
      for (let y = spacing; y < height; y += spacing) {
        line(0, pageTop + y, width, pageTop + y);
      }
      break;
    }
    case 'custom-ruled': {
      const spacing = Math.max(8, cmToPx(notebook.lineSpacingCm));
      for (let y = spacing; y < height; y += spacing) {
        line(0, pageTop + y, width, pageTop + y);
      }
      break;
    }
    case 'grid': {
      const spacing = 28;
      for (let y = spacing; y < height; y += spacing) line(0, pageTop + y, width, pageTop + y);
      for (let x = spacing; x < width; x += spacing) line(x, pageTop, x, pageTop + height);
      break;
    }
    case 'dotted': {
      const spacing = 28;
      ctx.fillStyle = color;
      for (let y = spacing; y < height; y += spacing) {
        for (let x = spacing; x < width; x += spacing) {
          ctx.beginPath();
          ctx.arc(x, pageTop + y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'blank':
    default:
      break;
  }
};

/** Paint the sheets of paper for every page intersecting `visible`. */
export const drawPages = (
  ctx: CanvasRenderingContext2D,
  notebook: Notebook,
  visible: Bounds,
  options: PageBackgroundOptions = {},
) => {
  const { width, height } = getPageSize(notebook.pageFormat);
  const stride = height + PAGE_GAP;
  const lineColor = notebook.lineColor ?? defaultLineColor(notebook.theme);

  const first = Math.max(0, Math.floor(visible.minY / stride));
  const last = Math.min(notebook.pageCount - 1, Math.ceil(visible.maxY / stride));

  for (let i = first; i <= last; i++) {
    const pageTop = i * stride;

    if (options.shadow !== false) {
      ctx.save();
      ctx.shadowColor = pageShadowColor(notebook.theme);
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = paperColor(notebook.theme);
      ctx.fillRect(0, pageTop, width, height);
      ctx.restore();
    } else {
      ctx.fillStyle = paperColor(notebook.theme);
      ctx.fillRect(0, pageTop, width, height);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, pageTop, width, height);
    ctx.clip();
    drawRuledLines(ctx, notebook, pageTop, width, height, lineColor);
    ctx.restore();
  }
};

/* ------------------------------------------------------------------ */
/* Objects                                                             */
/* ------------------------------------------------------------------ */

export interface DrawObjectsOptions {
  customFonts: CustomFont[];
  pressureEnabled: boolean;
  /** Objects to skip, e.g. one being live-edited in an overlay. */
  hidden?: Set<string>;
  /** Called when an image finishes decoding, so the caller can redraw. */
  onImageLoaded?: () => void;
}

export const drawStroke = (
  ctx: CanvasRenderingContext2D,
  stroke: StrokeObject,
  pressureEnabled: boolean,
) => {
  if (stroke.points.length === 0) return;
  const path = strokePath(stroke.points, {
    tool: stroke.tool,
    size: stroke.size,
    pressureEnabled,
    // Replay the decision made when the stroke was drawn. Older strokes
    // predate the field and were captured with a flat pressure of 0.5.
    simulatePressure: stroke.simulatePressure ?? false,
    complete: true,
  });

  ctx.save();
  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = stroke.opacity;
    ctx.fillStyle = stroke.color;
  }
  ctx.fill(path);
  ctx.restore();
};

export const drawText = (
  ctx: CanvasRenderingContext2D,
  obj: TextObject,
  customFonts: CustomFont[],
) => {
  const custom = customFonts.find((f) => f.id === obj.fontFamily);
  const { lines } = layoutText(obj.text, obj.width, obj.fontSize, obj.fontFamily, customFonts);
  const lh = lineHeightFor(obj.fontSize);

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  if (custom) {
    const atlas = peekGlyphAtlas(custom.id);
    if (atlas) {
      const scale = glyphScale(obj.fontSize);
      let y = obj.y;
      for (const line of lines) {
        // Baseline sits near the bottom of the line box.
        const baseline = y + obj.fontSize;
        let x = obj.x;
        for (const ch of line) {
          const glyph = atlas.glyphs.get(ch);
          if (glyph) {
            const tinted = tintedGlyph(atlas, ch, obj.color);
            if (tinted) {
              ctx.drawImage(
                tinted,
                x,
                baseline + glyph.topFromBaseline * scale,
                glyph.inkWidth * scale,
                glyph.inkHeight * scale,
              );
            }
          }
          x += glyphAdvance(atlas, ch, obj.fontSize);
        }
        y += lh;
      }
      ctx.restore();
      return;
    }
    // Atlas still rasterising — fall through to a web font so text is never
    // invisible while it loads.
  }

  ctx.font = cssFont(obj.fontSize, custom ? 'Lora' : obj.fontFamily);
  ctx.fillStyle = obj.color;
  ctx.textBaseline = 'alphabetic';
  let y = obj.y;
  for (const line of lines) {
    ctx.fillText(line, obj.x, y + obj.fontSize);
    y += lh;
  }
  ctx.restore();
};

const drawImageObject = (
  ctx: CanvasRenderingContext2D,
  obj: Extract<NoteObject, { kind: 'image' }>,
  onImageLoaded?: () => void,
) => {
  const img = peekImage(obj.src);
  if (img) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(img, obj.x, obj.y, obj.width, obj.height);
    ctx.restore();
    return;
  }
  // Placeholder while decoding, so the layout does not jump.
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(125,135,155,0.14)';
  ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
  ctx.restore();
  void requestImage(obj.src).then((loaded) => {
    if (loaded) onImageLoaded?.();
  });
};

/** Draw objects intersecting `visible`, in document order. */
export const drawObjects = (
  ctx: CanvasRenderingContext2D,
  objects: NoteObject[],
  visible: Bounds,
  options: DrawObjectsOptions,
) => {
  for (const obj of objects) {
    if (options.hidden?.has(obj.id)) continue;
    // An eraser must run even when its own bounds are offscreen-adjacent,
    // but culling by bounds is still correct: it can only affect what it covers.
    if (!boundsIntersect(obj.bounds, visible)) continue;

    switch (obj.kind) {
      case 'stroke':
        drawStroke(ctx, obj, options.pressureEnabled);
        break;
      case 'text':
        drawText(ctx, obj, options.customFonts);
        break;
      case 'image':
        drawImageObject(ctx, obj, options.onImageLoaded);
        break;
    }
  }
};

/* ------------------------------------------------------------------ */
/* Full-document rendering (print, PDF, PNG)                           */
/* ------------------------------------------------------------------ */

export interface RenderPageOptions {
  customFonts: CustomFont[];
  pressureEnabled: boolean;
  /** Output pixels per world pixel. 2 gives a crisp 192dpi export. */
  scale?: number;
}

/**
 * Render a single page to its own canvas at `scale`.
 * Callers must `preloadImages` first — this is synchronous by design so
 * multi-page export loops stay simple.
 */
export const renderPage = (
  notebook: Notebook,
  pageIndex: number,
  options: RenderPageOptions,
): HTMLCanvasElement => {
  const scale = options.scale ?? 2;
  const { width, height } = getPageSize(notebook.pageFormat);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const pageTop = pageIndex * (height + PAGE_GAP);
  const visible: Bounds = { minX: 0, minY: pageTop, maxX: width, maxY: pageTop + height };

  ctx.scale(scale, scale);
  ctx.translate(0, -pageTop);

  // Paper.
  ctx.fillStyle = paperColor(notebook.theme);
  ctx.fillRect(0, pageTop, width, height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, pageTop, width, height);
  ctx.clip();
  drawRuledLines(
    ctx,
    notebook,
    pageTop,
    width,
    height,
    notebook.lineColor ?? defaultLineColor(notebook.theme),
  );
  ctx.restore();

  // Content on its own layer so erasers cannot cut through the paper.
  const layer = document.createElement('canvas');
  layer.width = canvas.width;
  layer.height = canvas.height;
  const layerCtx = layer.getContext('2d');
  if (layerCtx) {
    layerCtx.scale(scale, scale);
    layerCtx.translate(0, -pageTop);
    layerCtx.save();
    layerCtx.beginPath();
    layerCtx.rect(0, pageTop, width, height);
    layerCtx.clip();
    drawObjects(layerCtx, notebook.objects, visible, {
      customFonts: options.customFonts,
      pressureEnabled: options.pressureEnabled,
    });
    layerCtx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, 0, 0);
  }

  return canvas;
};

/** Every image source referenced by a notebook, for preloading. */
export const imageSources = (notebook: Notebook): string[] =>
  notebook.objects.filter((o) => o.kind === 'image').map((o) => (o as { src: string }).src);

export const documentHeight = (notebook: Notebook) =>
  getTotalHeight(notebook.pageFormat, notebook.pageCount);

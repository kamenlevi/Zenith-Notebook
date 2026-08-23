/**
 * Hand-drawn font support.
 *
 * Three bugs made this feature unusable before:
 *
 *  1. The baseline and cap-height guides were painted *into* the glyph canvas,
 *     so `toDataURL()` baked two grey bars into every single letter. Guides are
 *     now a DOM overlay and never touch the bitmap.
 *  2. Only the currently selected font was rasterised, so a page using two
 *     custom fonts rendered one of them as nothing.
 *  3. Glyphs were tinted with the *current* tool colour at cache-build time,
 *     which retroactively recoloured every piece of text already on the page.
 *     Colour is now applied per draw and cached per (font, char, colour).
 */

import type { CustomFont } from '../types';

/** Glyph authoring canvas geometry. */
export const GLYPH_CANVAS = {
  width: 320,
  height: 400,
  /** y of the writing baseline */
  baseline: 300,
  /** y of the cap height line */
  capLine: 100,
};

/** Distance from cap line to baseline, in glyph-canvas pixels. */
const GLYPH_CAP_HEIGHT = GLYPH_CANVAS.baseline - GLYPH_CANVAS.capLine;

/** Cap height as a fraction of font size, matching typical Latin faces. */
const CAP_HEIGHT_RATIO = 0.7;

/** The character set a custom font can define. */
export const FONT_CHARSET = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'abcdefghijklmnopqrstuvwxyz',
  ...'0123456789',
  ...'.,?!\'"-:;()&/+=@#$%*',
];

export interface Glyph {
  /** Alpha mask of the trimmed glyph, uncoloured. */
  mask: HTMLCanvasElement;
  /** Ink width in glyph-canvas pixels. */
  inkWidth: number;
  /** Ink height in glyph-canvas pixels. */
  inkHeight: number;
  /** Ink top edge relative to the baseline (negative = above baseline). */
  topFromBaseline: number;
}

export interface GlyphAtlas {
  fontId: string;
  glyphs: Map<string, Glyph>;
  /** Mean ink width, used as the advance for characters with no glyph. */
  averageWidth: number;
}

const atlasCache = new Map<string, GlyphAtlas>();
const atlasPending = new Map<string, Promise<GlyphAtlas>>();

/** Tinted glyph cache, keyed by font + character + colour. */
const tintCache = new Map<string, HTMLCanvasElement>();
const TINT_CACHE_LIMIT = 900;

const loadImage = (src: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    if (!src || !src.startsWith('data:image')) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

/** Trim a drawn glyph down to its ink and record where that ink sits. */
const analyseGlyph = (img: HTMLImageElement): Glyph | null => {
  const scratch = document.createElement('canvas');
  scratch.width = img.width;
  scratch.height = img.height;
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);

  const { data } = ctx.getImageData(0, 0, img.width, img.height);
  let minX = img.width;
  let maxX = -1;
  let minY = img.height;
  let maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      // Ignore near-transparent antialiasing fringe.
      if (data[(y * img.width + x) * 4 + 3] > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null; // Nothing drawn.

  const inkWidth = maxX - minX + 1;
  const inkHeight = maxY - minY + 1;
  const mask = document.createElement('canvas');
  mask.width = inkWidth;
  mask.height = inkHeight;
  const maskCtx = mask.getContext('2d');
  if (!maskCtx) return null;
  maskCtx.drawImage(scratch, minX, minY, inkWidth, inkHeight, 0, 0, inkWidth, inkHeight);

  // Scale the authoring canvas coordinates in case the stored glyph was drawn
  // at a different resolution than the current GLYPH_CANVAS constant.
  const yScale = GLYPH_CANVAS.height / img.height;
  return {
    mask,
    inkWidth: inkWidth * (GLYPH_CANVAS.width / img.width),
    inkHeight: inkHeight * yScale,
    topFromBaseline: minY * yScale - GLYPH_CANVAS.baseline,
  };
};

/** Build (and memoise) the rasterised glyph set for a custom font. */
export const getGlyphAtlas = async (font: CustomFont): Promise<GlyphAtlas> => {
  const cached = atlasCache.get(font.id);
  if (cached) return cached;
  const pending = atlasPending.get(font.id);
  if (pending) return pending;

  const build = (async (): Promise<GlyphAtlas> => {
    const glyphs = new Map<string, Glyph>();
    const entries = Object.entries(font.characters ?? {});
    const images = await Promise.all(entries.map(([, src]) => loadImage(src)));
    let widthTotal = 0;
    let widthCount = 0;
    entries.forEach(([char], i) => {
      const img = images[i];
      if (!img) return;
      const glyph = analyseGlyph(img);
      if (!glyph) return;
      glyphs.set(char, glyph);
      widthTotal += glyph.inkWidth;
      widthCount++;
    });
    const atlas: GlyphAtlas = {
      fontId: font.id,
      glyphs,
      averageWidth: widthCount > 0 ? widthTotal / widthCount : GLYPH_CANVAS.width * 0.35,
    };
    atlasCache.set(font.id, atlas);
    atlasPending.delete(font.id);
    return atlas;
  })();

  atlasPending.set(font.id, build);
  return build;
};

/** Synchronous lookup for the render loop; null until the atlas is ready. */
export const peekGlyphAtlas = (fontId: string): GlyphAtlas | null =>
  atlasCache.get(fontId) ?? null;

export const invalidateGlyphAtlas = (fontId: string) => {
  atlasCache.delete(fontId);
  atlasPending.delete(fontId);
  for (const key of [...tintCache.keys()]) {
    if (key.startsWith(`${fontId}|`)) tintCache.delete(key);
  }
};

/** A glyph mask painted in `color`, cached. */
export const tintedGlyph = (
  atlas: GlyphAtlas,
  char: string,
  color: string,
): HTMLCanvasElement | null => {
  const glyph = atlas.glyphs.get(char);
  if (!glyph) return null;
  const key = `${atlas.fontId}|${char}|${color}`;
  const hit = tintCache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = glyph.mask.width;
  canvas.height = glyph.mask.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(glyph.mask, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (tintCache.size >= TINT_CACHE_LIMIT) {
    // Cheap eviction: drop the oldest inserted entry.
    const oldest = tintCache.keys().next();
    if (!oldest.done) tintCache.delete(oldest.value);
  }
  tintCache.set(key, canvas);
  return canvas;
};

/** Scale factor from glyph-canvas pixels to rendered pixels at `fontSize`. */
export const glyphScale = (fontSize: number) => (fontSize * CAP_HEIGHT_RATIO) / GLYPH_CAP_HEIGHT;

/** Horizontal advance for a character at `fontSize`, in rendered pixels. */
export const glyphAdvance = (atlas: GlyphAtlas, char: string, fontSize: number): number => {
  if (char === ' ') return fontSize * 0.32;
  if (char === '\t') return fontSize * 1.28;
  const scale = glyphScale(fontSize);
  const glyph = atlas.glyphs.get(char);
  const ink = glyph ? glyph.inkWidth : atlas.averageWidth;
  // Sidebearing keeps letters from colliding.
  return ink * scale + fontSize * 0.09;
};

export const isCustomFontId = (fontFamily: string, fonts: CustomFont[]) =>
  fonts.some((f) => f.id === fontFamily);

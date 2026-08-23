/**
 * Text measurement and wrapping.
 *
 * The old build rendered text with a bare `fillText` per line and no wrapping
 * at all, while the editing overlay was a fixed 816px-wide textarea that wrapped
 * in the browser. So what you typed and what got committed to the page were
 * different shapes, and any line longer than the page just ran off the edge.
 *
 * Both the canvas renderer and the editing overlay now go through this module,
 * so the preview matches the result exactly.
 */

import type { CustomFont, TextObject } from '../types';
import { getGlyphAtlas, glyphAdvance, peekGlyphAtlas } from './customFont';

/** Line box height as a multiple of font size. */
export const LINE_HEIGHT_RATIO = 1.35;

export const lineHeightFor = (fontSize: number) => fontSize * LINE_HEIGHT_RATIO;

/** CSS/canvas font shorthand for a web font. */
export const cssFont = (fontSize: number, fontFamily: string) =>
  `${fontSize}px "${fontFamily}", Lora, Georgia, serif`;

export interface Measurer {
  measure: (text: string) => number;
}

let measureCanvas: HTMLCanvasElement | null = null;
const getMeasureContext = (): CanvasRenderingContext2D | null => {
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  return measureCanvas.getContext('2d');
};

/**
 * Build a measurer for a text object's font, custom or web.
 * Returns null for a custom font whose atlas has not been rasterised yet.
 */
export const getMeasurer = (
  fontSize: number,
  fontFamily: string,
  customFonts: CustomFont[],
): Measurer => {
  const custom = customFonts.find((f) => f.id === fontFamily);
  if (custom) {
    const atlas = peekGlyphAtlas(custom.id);
    if (atlas) {
      return {
        measure: (text) => {
          let width = 0;
          for (const ch of text) width += glyphAdvance(atlas, ch, fontSize);
          return width;
        },
      };
    }
    // Atlas not ready: kick off the build and approximate for now.
    void getGlyphAtlas(custom);
    return { measure: (text) => [...text].length * fontSize * 0.5 };
  }

  const ctx = getMeasureContext();
  if (!ctx) return { measure: (text) => [...text].length * fontSize * 0.5 };
  ctx.font = cssFont(fontSize, fontFamily);
  return { measure: (text) => ctx.measureText(text).width };
};

/**
 * Wrap `text` to `maxWidth`, breaking on whitespace and falling back to
 * mid-word breaks for anything that cannot fit on a line of its own.
 * Explicit newlines are always honoured.
 */
export const wrapText = (text: string, maxWidth: number, measurer: Measurer): string[] => {
  const out: string[] = [];
  const limit = Math.max(16, maxWidth);

  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      out.push('');
      continue;
    }
    // Keep trailing spaces attached to their word so wrapping is stable.
    // The leading \s* only ever matches on the first token, because each
    // token's trailing \s* already consumes the gap before the next one.
    // That preserves a paragraph's indentation without double-counting.
    const tokens = paragraph.match(/\s*\S+\s*/g) ?? [paragraph];
    let line = '';

    const pushBrokenWord = (word: string) => {
      let chunk = '';
      for (const ch of word) {
        if (chunk && measurer.measure(chunk + ch) > limit) {
          out.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      line = chunk;
    };

    for (const token of tokens) {
      const candidate = line + token;
      if (!line || measurer.measure(candidate.trimEnd()) <= limit) {
        line = candidate;
        continue;
      }
      out.push(line.trimEnd());
      if (measurer.measure(token.trimEnd()) > limit) {
        pushBrokenWord(token.trimEnd());
      } else {
        line = token;
      }
    }
    out.push(line.trimEnd());
  }

  return out.length > 0 ? out : [''];
};

export interface TextLayout {
  lines: string[];
  width: number;
  height: number;
}

export const layoutText = (
  text: string,
  wrapWidth: number,
  fontSize: number,
  fontFamily: string,
  customFonts: CustomFont[],
): TextLayout => {
  const measurer = getMeasurer(fontSize, fontFamily, customFonts);
  const lines = wrapText(text, wrapWidth, measurer);
  let widest = 0;
  for (const line of lines) widest = Math.max(widest, measurer.measure(line));
  return {
    lines,
    width: Math.min(wrapWidth, Math.max(widest, fontSize * 0.5)),
    height: lines.length * lineHeightFor(fontSize),
  };
};

/**
 * Bounds for a text object. `x`/`y` are the top-left of the text block —
 * the old model used an ambiguous baseline origin that made hit-testing and
 * dragging inconsistent.
 */
export const textBounds = (obj: TextObject, customFonts: CustomFont[]) => {
  const { height } = layoutText(obj.text, obj.width, obj.fontSize, obj.fontFamily, customFonts);
  return {
    minX: obj.x,
    minY: obj.y,
    maxX: obj.x + obj.width,
    maxY: obj.y + Math.max(height, lineHeightFor(obj.fontSize)),
  };
};

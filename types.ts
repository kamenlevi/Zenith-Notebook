/**
 * Core document model.
 *
 * A Notebook is a flat, ordered list of objects laid out in a single
 * "world" coordinate space that runs top-to-bottom across all pages.
 * Rendering, hit-testing and export all operate in that one space, which
 * is what lets zoom stay vector-crisp instead of scaling a bitmap.
 */

export type ToolType =
  | 'pen'
  | 'pencil'
  | 'highlighter'
  | 'eraser'
  | 'text'
  | 'select';

/** Tools that lay down ink. */
export type InkTool = 'pen' | 'pencil' | 'highlighter' | 'eraser';

export type EraserMode = 'stroke' | 'pixel';

export type Theme = 'light' | 'dark';

export type PageFormat = 'Letter' | 'A4' | 'Tablet' | 'Widescreen';

export type PageBackground = 'ruled' | 'grid' | 'dotted' | 'custom-ruled' | 'blank';

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A sampled input point. `p` is normalised pressure (0..1). */
export interface StrokePoint {
  x: number;
  y: number;
  p: number;
}

export interface StrokeObject {
  kind: 'stroke';
  id: string;
  tool: InkTool;
  color: string;
  /** Base stroke width in world pixels, before pressure modulation. */
  size: number;
  opacity: number;
  points: StrokePoint[];
  /** Cached world-space bounds, inflated by half the stroke width. */
  bounds: Bounds;
}

export interface TextObject {
  kind: 'text';
  id: string;
  text: string;
  x: number;
  y: number;
  /** Wrap width in world pixels. Canvas rendering and the editor share it. */
  width: number;
  fontSize: number;
  /** Either a web font family name or a CustomFont id. */
  fontFamily: string;
  color: string;
  bounds: Bounds;
}

export interface ImageObject {
  kind: 'image';
  id: string;
  /** Key into the image asset store (IndexedDB), or an inline data URL. */
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  bounds: Bounds;
}

export type NoteObject = StrokeObject | TextObject | ImageObject;

export interface Notebook {
  id: string;
  name: string;
  objects: NoteObject[];
  pageCount: number;
  theme: Theme;
  pageFormat: PageFormat;
  pageBackground: PageBackground;
  lineSpacingCm: number;
  /** null = derive from theme. */
  lineColor: string | null;
  updatedAt: number;
}

export interface ToolSettings {
  tool: ToolType;
  /** Per-tool colour, so switching pen -> highlighter -> pen is lossless. */
  colors: Record<InkTool | 'text', string>;
  /** Per-tool size, same reasoning. */
  sizes: Record<InkTool | 'text', number>;
  fontFamily: string;
  eraserMode: EraserMode;
  /** Let a finger draw instead of pan. Off by default on touch devices. */
  fingerDraws: boolean;
}

export interface AppSettings {
  autoSave: boolean;
  /** Apple Pencil / stylus pressure affects stroke width. */
  pressureEnabled: boolean;
  /** Two-finger tap = undo, three-finger tap = redo. */
  gestureShortcuts: boolean;
}

export interface CustomFont {
  id: string;
  name: string;
  /** character -> PNG data URL of the drawn glyph */
  characters: Record<string, string>;
}

/** Serialised .zenith export payload. */
export interface NotebookExport {
  format: 'zenith-notebook';
  version: 2;
  notebook: Notebook;
  /** Image assets inlined as data URLs, keyed by asset id. */
  assets: Record<string, string>;
}

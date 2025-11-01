export enum ToolType {
  Pen = 'pen',
  Pencil = 'pencil',
  Highlighter = 'highlighter',
  Eraser = 'eraser',
  Text = 'text',
}

export interface ToolSettings {
  tool: ToolType;
  color: string;
  size: number;
  fontFamily: string;
}

export type Theme = 'light' | 'dark';

export type PageFormat = 'Letter' | 'A4' | 'Tablet' | 'Widescreen';

export type PageBackground = 'ruled' | 'grid' | 'custom-ruled' | 'blank';

export interface ImageObject {
  src: string;
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Vector Path for freehand drawing
export interface Path {
  id: string;
  tool: ToolType.Pen | ToolType.Pencil | ToolType.Highlighter | ToolType.Eraser;
  color: string;
  size: number;
  points: { x: number; y: number }[];
  globalCompositeOperation: GlobalCompositeOperation;
  globalAlpha: number;
}

// Vector Object for text
export interface TextObject {
  id: string;
  tool: ToolType.Text;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  color: string;
}

export type DrawingObject = Path | TextObject;

export interface Subject {
  id: string;
  name: string;
  canvasState: DrawingObject[];
  pageCount: number;
  theme: Theme;
  pageFormat: PageFormat;
  pageBackground: PageBackground;
  lineSpacingCm: number;
  lineColor: string | null;
  images: ImageObject[];
}

export interface AppSettings {
  autoSave: boolean;
}

export interface CustomFont {
  id: string;
  name: string;
  characters: Record<string, string>; // char -> dataUrl
}

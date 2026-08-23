/**
 * The notebook canvas engine.
 *
 * Deliberately not a React component. The old build routed every pan, zoom and
 * pointer sample through `useState`, so each finger movement triggered a React
 * render before anything could be drawn — which is why scrolling and drawing
 * both felt laggy. Here the engine owns the canvases, the viewport and the
 * document, drives its own rAF loop, and only notifies React when something
 * changes that the *chrome* needs to know about.
 */

import type {
  AppSettings,
  Bounds,
  CustomFont,
  ImageObject,
  InkTool,
  Notebook,
  NoteObject,
  StrokeObject,
  StrokePoint,
  TextObject,
  ToolSettings,
} from '../types';
import {
  PAGE_GAP,
  PAGE_MARGIN,
  boundsContainPoint,
  boundsIntersect,
  clamp,
  distanceToSegmentSq,
  getLineHeight,
  getPageSize,
  getTotalHeight,
  pointInPolygon,
  projectOntoLine,
  strokeBounds,
  translateBounds,
  unionBounds,
} from '../lib/geometry';
import { uid } from '../lib/id';
import {
  applyViewport,
  deskColor,
  drawObjects,
  drawPages,
  drawStroke,
  visibleBounds,
  type Viewport,
} from '../lib/render';
import { isPressureCapable, readPressure, strokePath } from '../lib/stroke';
import { lineHeightFor, textBounds } from '../lib/text';
import { requestImage } from '../lib/imageCache';
import { putAsset } from '../lib/storage';

const MIN_SCALE = 0.15;
const MAX_SCALE = 8;
const TAP_MAX_MS = 260;
const TAP_MAX_MOVE = 14;
const DOUBLE_TAP_MS = 320;
const HANDLE_SIZE = 11;
const SELECTION_PAD = 10;
const RULER_HALF_WIDTH = 34;
const RULER_SNAP_DISTANCE = 26;
const HISTORY_LIMIT = 120;

export interface RulerState {
  visible: boolean;
  /** Centre of the straightedge, in world coordinates. */
  x: number;
  y: number;
  /** Radians. */
  angle: number;
  length: number;
}

export interface TextEditRequest {
  id: string;
  /** True when committing should create a new object rather than replace one. */
  isNew: boolean;
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontFamily: string;
  color: string;
}

export interface SelectionInfo {
  ids: string[];
  /** Selection bounds in CSS pixels relative to the canvas. */
  screen: { x: number; y: number; width: number; height: number } | null;
  /** True when exactly one text object is selected. */
  singleTextId: string | null;
}

export interface EngineCallbacks {
  onDocumentChange: (objects: NoteObject[]) => void;
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
  onViewportChange: (info: { scale: number; pageIndex: number }) => void;
  onSelectionChange: (info: SelectionInfo) => void;
  onTextEdit: (request: TextEditRequest | null) => void;
  /** Ask the editing overlay to commit whatever the user has typed so far. */
  onCommitPendingText: () => void;
  onRulerChange: (ruler: RulerState) => void;
  onError: (message: string) => void;
}

type Mode =
  | { kind: 'idle' }
  | { kind: 'draw'; pointerId: number }
  | { kind: 'erase-stroke'; pointerId: number; last: { x: number; y: number } }
  | { kind: 'pan'; pointerId: number; lastX: number; lastY: number }
  | { kind: 'gesture' }
  | { kind: 'lasso'; pointerId: number; points: { x: number; y: number }[] }
  | { kind: 'move-selection'; pointerId: number; lastX: number; lastY: number; moved: boolean }
  | {
      kind: 'scale-selection';
      pointerId: number;
      anchorX: number;
      anchorY: number;
      startDistance: number;
      startObjects: NoteObject[];
    }
  | { kind: 'move-ruler'; pointerId: number; lastX: number; lastY: number }
  | { kind: 'rotate-ruler'; pointerId: number };

interface ActivePointer {
  id: number;
  type: string;
  x: number;
  y: number;
  startX: number;
  startY: number;
  startTime: number;
}

interface LiveStroke {
  tool: InkTool;
  color: string;
  size: number;
  opacity: number;
  points: StrokePoint[];
  /** The device reported no usable pressure, so width follows velocity. */
  simulatePressure: boolean;
  /** Set when the stroke is being drawn along the ruler. */
  snapAngle: number | null;
  snapOrigin: { x: number; y: number } | null;
}

const noop = () => {};

export class NotebookEngine {
  private base: HTMLCanvasElement | null = null;
  private overlay: HTMLCanvasElement | null = null;
  private container: HTMLElement | null = null;
  private baseCtx: CanvasRenderingContext2D | null = null;
  private overlayCtx: CanvasRenderingContext2D | null = null;
  /** Content layer, so the eraser cannot cut through the paper. */
  private layer: HTMLCanvasElement = document.createElement('canvas');
  private layerCtx: CanvasRenderingContext2D | null = null;

  private width = 0;
  private height = 0;
  private dpr = 1;

  private notebook: Notebook | null = null;
  private objects: NoteObject[] = [];
  private tools: ToolSettings;
  private settings: AppSettings;
  private customFonts: CustomFont[] = [];

  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;

  private mode: Mode = { kind: 'idle' };
  private pointers = new Map<number, ActivePointer>();
  private penActive = false;
  private live: LiveStroke | null = null;
  private selection = new Set<string>();
  private lassoPoints: { x: number; y: number }[] = [];
  private eraserCursor: { x: number; y: number } | null = null;

  private ruler: RulerState = { visible: false, x: 0, y: 0, angle: 0, length: 620 };

  private history: NoteObject[][] = [];
  private historyIndex = -1;

  private pinch: { distance: number; centerX: number; centerY: number } | null = null;
  private gestureMaxPointers = 0;
  private gestureMoved = 0;
  private lastTapTime = 0;
  private lastTapX = 0;
  private lastTapY = 0;

  private dirtyBase = true;
  private dirtyOverlay = true;
  private frameHandle: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private detachFns: (() => void)[] = [];
  private lastReportedPage = -1;
  private lastReportedScale = -1;
  private editingTextId: string | null = null;
  private textEditActive = false;

  private cb: EngineCallbacks = {
    onDocumentChange: noop,
    onHistoryChange: noop,
    onViewportChange: noop,
    onSelectionChange: noop,
    onTextEdit: noop,
    onCommitPendingText: noop,
    onRulerChange: noop,
    onError: noop,
  };

  constructor(tools: ToolSettings, settings: AppSettings) {
    this.tools = tools;
    this.settings = settings;
    this.layerCtx = this.layer.getContext('2d');
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                         */
  /* ---------------------------------------------------------------- */

  setCallbacks(cb: Partial<EngineCallbacks>) {
    this.cb = { ...this.cb, ...cb };
  }

  attach(base: HTMLCanvasElement, overlay: HTMLCanvasElement, container: HTMLElement) {
    this.base = base;
    this.overlay = overlay;
    this.container = container;
    // `willReadFrequently` was set on these canvases before, which opts the
    // whole surface out of GPU acceleration. Nothing here reads pixels back.
    this.baseCtx = base.getContext('2d');
    this.overlayCtx = overlay.getContext('2d');

    const opts: AddEventListenerOptions = { passive: false };
    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | Window,
      type: K,
      handler: (ev: HTMLElementEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, handler as EventListener, options);
      this.detachFns.push(() => target.removeEventListener(type, handler as EventListener, options));
    };

    on(overlay, 'pointerdown', this.handlePointerDown, opts);
    on(overlay, 'pointermove', this.handlePointerMove, opts);
    on(overlay, 'pointerup', this.handlePointerUp, opts);
    on(overlay, 'pointercancel', this.handlePointerCancel, opts);
    on(overlay, 'wheel', this.handleWheel, opts);
    on(overlay, 'contextmenu', (e) => e.preventDefault(), opts);

    // Safari's proprietary pinch events are not in the DOM typings but still
    // fire on iPadOS, and will zoom the page out from under the canvas.
    const blockSafariGesture = (event: Event) => event.preventDefault();
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      overlay.addEventListener(type, blockSafariGesture, opts);
      this.detachFns.push(() => overlay.removeEventListener(type, blockSafariGesture, opts));
    }

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.startLoop();
  }

  destroy() {
    this.detachFns.forEach((fn) => fn());
    this.detachFns = [];
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
    this.base = this.overlay = null;
    this.baseCtx = this.overlayCtx = null;
    this.container = null;
  }

  private startLoop() {
    const frame = () => {
      this.frameHandle = requestAnimationFrame(frame);
      if (this.dirtyBase) {
        this.dirtyBase = false;
        this.renderBase();
      }
      if (this.dirtyOverlay) {
        this.dirtyOverlay = false;
        this.renderOverlay();
      }
    };
    this.frameHandle = requestAnimationFrame(frame);
  }

  private invalidate(base = true, overlay = true) {
    if (base) this.dirtyBase = true;
    if (overlay) this.dirtyOverlay = true;
  }

  /* ---------------------------------------------------------------- */
  /* Configuration                                                     */
  /* ---------------------------------------------------------------- */

  setNotebook(notebook: Notebook, resetView: boolean) {
    const changedDocument = this.notebook?.id !== notebook.id;
    const changedFormat = !changedDocument && this.notebook?.pageFormat !== notebook.pageFormat;
    this.notebook = notebook;
    if (!changedDocument) {
      // React holds a copy of the object list; the engine's is authoritative.
      this.notebook.objects = this.objects;
    }
    if (changedDocument) {
      this.objects = notebook.objects;
      this.history = [notebook.objects];
      this.historyIndex = 0;
      this.selection.clear();
      this.cancelTextEdit();
      this.emitSelection();
      this.emitHistory();
      this.ruler = { ...this.ruler, visible: false };
      this.cb.onRulerChange(this.ruler);
    }
    if (resetView || changedDocument || changedFormat) this.fitWidth(false);
    this.clampViewport();
    this.invalidate();
    this.emitViewport();
  }

  /** Replace the object list from outside (undo across a reload, import, etc). */
  setObjects(objects: NoteObject[], pushToHistory: boolean) {
    this.objects = objects;
    if (this.notebook) this.notebook.objects = objects;
    if (pushToHistory) this.pushHistory();
    this.invalidate();
  }

  setToolSettings(tools: ToolSettings) {
    const previous = this.tools;
    this.tools = tools;
    if (previous.tool !== tools.tool) {
      if (tools.tool !== 'select') this.clearSelection();
      this.cancelTextEdit();
      this.updateCursor();
    }
    this.invalidate(false, true);
  }

  setAppSettings(settings: AppSettings) {
    this.settings = settings;
    this.invalidate();
  }

  setCustomFonts(fonts: CustomFont[]) {
    this.customFonts = fonts;
    this.invalidate();
  }

  getObjects() {
    return this.objects;
  }

  getRuler(): RulerState {
    return { ...this.ruler };
  }

  toggleRuler() {
    const visible = !this.ruler.visible;
    if (visible) {
      // Drop it in the middle of the current view, horizontal.
      const centre = this.screenToWorld(this.width / 2, this.height / 2);
      this.ruler = {
        visible,
        x: centre.x,
        y: centre.y,
        angle: 0,
        length: Math.min(760, Math.max(360, this.width / this.scale * 0.7)),
      };
    } else {
      this.ruler = { ...this.ruler, visible };
    }
    this.cb.onRulerChange(this.getRuler());
    this.invalidate(false, true);
  }

  /* ---------------------------------------------------------------- */
  /* Viewport                                                          */
  /* ---------------------------------------------------------------- */

  private viewport(): Viewport {
    return {
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      width: this.width,
      height: this.height,
    };
  }

  private screenToWorld(x: number, y: number) {
    return { x: (x - this.offsetX) / this.scale, y: (y - this.offsetY) / this.scale };
  }

  private worldToScreen(x: number, y: number) {
    return { x: x * this.scale + this.offsetX, y: y * this.scale + this.offsetY };
  }

  private eventPoint(event: PointerEvent | WheelEvent) {
    const rect = this.overlay?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  }

  private resize() {
    const container = this.container;
    const base = this.base;
    const overlay = this.overlay;
    if (!container || !base || !overlay) return;

    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    this.width = rect.width;
    this.height = rect.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);

    for (const canvas of [base, overlay, this.layer]) {
      canvas.width = Math.round(rect.width * this.dpr);
      canvas.height = Math.round(rect.height * this.dpr);
      if (canvas !== this.layer) {
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
      }
    }
    this.clampViewport();
    this.invalidate();
  }

  private minScale() {
    if (!this.notebook || this.width === 0) return MIN_SCALE;
    const { width } = getPageSize(this.notebook.pageFormat);
    return Math.max(MIN_SCALE, Math.min(1, (this.width * 0.35) / width));
  }

  private clampViewport() {
    if (!this.notebook) return;
    const { width: pageWidth } = getPageSize(this.notebook.pageFormat);
    const totalHeight = getTotalHeight(this.notebook.pageFormat, this.notebook.pageCount);

    this.scale = clamp(this.scale, this.minScale(), MAX_SCALE);

    const contentWidth = pageWidth * this.scale;
    if (contentWidth <= this.width) {
      // Narrower than the viewport: keep it centred.
      this.offsetX = (this.width - contentWidth) / 2;
    } else {
      const slack = this.width * 0.25;
      this.offsetX = clamp(this.offsetX, this.width - contentWidth - slack, slack);
    }

    const contentHeight = totalHeight * this.scale;
    const slackY = this.height * 0.35;
    if (contentHeight <= this.height) {
      this.offsetY = clamp(this.offsetY, -slackY, this.height - contentHeight + slackY);
    } else {
      this.offsetY = clamp(this.offsetY, this.height - contentHeight - slackY, slackY);
    }
  }

  private emitViewport() {
    if (!this.notebook) return;
    const { height } = getPageSize(this.notebook.pageFormat);
    const stride = height + PAGE_GAP;
    const centreY = (-this.offsetY + this.height / 2) / this.scale;
    const pageIndex = clamp(Math.floor(centreY / stride), 0, this.notebook.pageCount - 1);
    const roundedScale = Math.round(this.scale * 100) / 100;
    if (pageIndex !== this.lastReportedPage || roundedScale !== this.lastReportedScale) {
      this.lastReportedPage = pageIndex;
      this.lastReportedScale = roundedScale;
      this.cb.onViewportChange({ scale: roundedScale, pageIndex });
    }
  }

  private setViewport(scale: number, offsetX: number, offsetY: number) {
    this.scale = scale;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.clampViewport();
    this.invalidate();
    this.emitViewport();
    this.emitSelection();
  }

  fitWidth(animate = true) {
    if (!this.notebook || this.width === 0) return;
    const { width } = getPageSize(this.notebook.pageFormat);
    const padding = this.width > 700 ? 48 : 12;
    const target = clamp((this.width - padding * 2) / width, this.minScale(), MAX_SCALE);
    const worldCentreY = (-this.offsetY + this.height / 2) / this.scale;
    const offsetY = -worldCentreY * target + this.height / 2;
    if (animate) this.animateTo(target, (this.width - width * target) / 2, offsetY);
    else this.setViewport(target, (this.width - width * target) / 2, offsetY);
  }

  zoomBy(factor: number, cx?: number, cy?: number) {
    const focusX = cx ?? this.width / 2;
    const focusY = cy ?? this.height / 2;
    const next = clamp(this.scale * factor, this.minScale(), MAX_SCALE);
    const world = this.screenToWorld(focusX, focusY);
    this.setViewport(next, focusX - world.x * next, focusY - world.y * next);
  }

  resetZoom() {
    const world = this.screenToWorld(this.width / 2, this.height / 2);
    this.animateTo(1, this.width / 2 - world.x, this.height / 2 - world.y);
  }

  scrollToPage(index: number) {
    if (!this.notebook) return;
    const { height } = getPageSize(this.notebook.pageFormat);
    const top = index * (height + PAGE_GAP);
    this.animateTo(this.scale, this.offsetX, -top * this.scale + 16);
  }

  private animationHandle: number | null = null;

  private animateTo(scale: number, offsetX: number, offsetY: number) {
    if (this.animationHandle !== null) cancelAnimationFrame(this.animationHandle);
    const fromScale = this.scale;
    const fromX = this.offsetX;
    const fromY = this.offsetY;
    const start = performance.now();
    const duration = 220;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      this.setViewport(
        fromScale + (scale - fromScale) * e,
        fromX + (offsetX - fromX) * e,
        fromY + (offsetY - fromY) * e,
      );
      if (t < 1) this.animationHandle = requestAnimationFrame(step);
      else this.animationHandle = null;
    };
    this.animationHandle = requestAnimationFrame(step);
  }

  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  private renderBase() {
    const ctx = this.baseCtx;
    const notebook = this.notebook;
    if (!ctx || !notebook || this.width === 0) return;

    const vp = this.viewport();
    const visible = visibleBounds(vp);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = deskColor(notebook.theme);
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    applyViewport(ctx, vp);
    drawPages(ctx, notebook, visible);
    ctx.restore();

    // Content layer: everything the eraser is allowed to touch.
    const layerCtx = this.layerCtx;
    if (layerCtx) {
      layerCtx.setTransform(1, 0, 0, 1, 0, 0);
      layerCtx.clearRect(0, 0, this.layer.width, this.layer.height);
      layerCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      layerCtx.save();
      applyViewport(layerCtx, vp);
      this.clipToPages(layerCtx, visible);

      const hidden = this.editingTextId ? new Set([this.editingTextId]) : undefined;
      drawObjects(layerCtx, this.objects, visible, {
        customFonts: this.customFonts,
        pressureEnabled: this.settings.pressureEnabled,
        hidden,
        onImageLoaded: () => this.invalidate(true, false),
      });

      // A live eraser stroke has to composite against committed ink, so it
      // renders here rather than on the overlay.
      if (this.live && this.live.tool === 'eraser') {
        drawStroke(layerCtx, this.liveToObject(this.live), this.settings.pressureEnabled);
      }

      layerCtx.restore();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.layer, 0, 0);
    }
  }

  private clipToPages(ctx: CanvasRenderingContext2D, visible: Bounds) {
    const notebook = this.notebook;
    if (!notebook) return;
    const { width, height } = getPageSize(notebook.pageFormat);
    const stride = height + PAGE_GAP;
    const first = Math.max(0, Math.floor(visible.minY / stride));
    const last = Math.min(notebook.pageCount - 1, Math.ceil(visible.maxY / stride));
    ctx.beginPath();
    for (let i = first; i <= last; i++) ctx.rect(0, i * stride, width, height);
    ctx.clip();
  }

  private renderOverlay() {
    const ctx = this.overlayCtx;
    if (!ctx || this.width === 0) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlay!.width, this.overlay!.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const vp = this.viewport();
    ctx.save();
    applyViewport(ctx, vp);

    // Live ink (the eraser is handled on the base layer instead).
    if (this.live && this.live.tool !== 'eraser') {
      // Identical options to the committed stroke, `complete` included, so
      // what the user watches themselves draw is exactly what gets kept.
      // Rendering the preview as an unfinished stroke made it visibly change
      // width the instant the pen lifted.
      const path = strokePath(this.live.points, {
        tool: this.live.tool,
        size: this.live.size,
        pressureEnabled: this.settings.pressureEnabled,
        simulatePressure: this.live.simulatePressure,
        complete: true,
      });
      ctx.globalAlpha = this.live.opacity;
      ctx.fillStyle = this.live.color;
      ctx.fill(path);
      ctx.globalAlpha = 1;
    }

    if (this.lassoPoints.length > 1) this.drawLasso(ctx);
    if (this.selection.size > 0) this.drawSelection(ctx);
    if (this.ruler.visible) this.drawRuler(ctx);

    ctx.restore();

    if (this.eraserCursor) this.drawEraserCursor(ctx);
  }

  private drawLasso(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(this.lassoPoints[0].x, this.lassoPoints[0].y);
    for (let i = 1; i < this.lassoPoints.length; i++) {
      ctx.lineTo(this.lassoPoints[i].x, this.lassoPoints[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(56,189,248,0.12)';
    ctx.fill();
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 1.5 / this.scale;
    ctx.setLineDash([6 / this.scale, 4 / this.scale]);
    ctx.stroke();
    ctx.restore();
  }

  private drawSelection(ctx: CanvasRenderingContext2D) {
    const bounds = this.selectionBounds();
    if (!bounds) return;
    const pad = SELECTION_PAD / this.scale;
    const x = bounds.minX - pad;
    const y = bounds.minY - pad;
    const w = bounds.maxX - bounds.minX + pad * 2;
    const h = bounds.maxY - bounds.minY + pad * 2;

    ctx.save();
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 1.5 / this.scale;
    ctx.setLineDash([7 / this.scale, 4 / this.scale]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    const hs = HANDLE_SIZE / this.scale;
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#0EA5E9';
    ctx.lineWidth = 1.5 / this.scale;
    for (const [hx, hy] of [
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ]) {
      ctx.beginPath();
      ctx.roundRect(hx - hs / 2, hy - hs / 2, hs, hs, hs * 0.25);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawRuler(ctx: CanvasRenderingContext2D) {
    const { x, y, angle, length } = this.ruler;
    const half = length / 2;
    const w = RULER_HALF_WIDTH;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.fillStyle = 'rgba(15,23,42,0.55)';
    ctx.strokeStyle = 'rgba(226,232,240,0.85)';
    ctx.lineWidth = 1.25 / this.scale;
    ctx.beginPath();
    ctx.roundRect(-half, -w / 2, length, w, 6 / this.scale);
    ctx.fill();
    ctx.stroke();

    // Centimetre ticks along the working edge.
    ctx.strokeStyle = 'rgba(226,232,240,0.7)';
    ctx.lineWidth = 1 / this.scale;
    const tick = 96 / 2.54 / 2; // half-centimetre
    for (let d = 0; d <= half; d += tick) {
      const long = Math.round(d / tick) % 2 === 0;
      const len = long ? w * 0.42 : w * 0.24;
      for (const sign of [1, -1]) {
        ctx.beginPath();
        ctx.moveTo(sign * d, w / 2);
        ctx.lineTo(sign * d, w / 2 - len);
        ctx.stroke();
      }
    }

    // Rotation grips.
    ctx.fillStyle = 'rgba(56,189,248,0.95)';
    for (const sign of [1, -1]) {
      ctx.beginPath();
      ctx.arc(sign * (half - 14 / this.scale), 0, 7 / this.scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawEraserCursor(ctx: CanvasRenderingContext2D) {
    if (!this.eraserCursor) return;
    const radius = (this.eraserSize() * this.scale) / 2;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.beginPath();
    ctx.arc(this.eraserCursor.x, this.eraserCursor.y, Math.max(4, radius), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(148,163,184,0.95)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(15,23,42,0.6)';
    ctx.lineWidth = 3;
    ctx.globalCompositeOperation = 'destination-over';
    ctx.stroke();
    ctx.restore();
  }

  /* ---------------------------------------------------------------- */
  /* History                                                           */
  /* ---------------------------------------------------------------- */

  private pushHistory() {
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(this.objects);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    this.historyIndex = this.history.length - 1;
    this.emitHistory();
    this.cb.onDocumentChange(this.objects);
  }

  private emitHistory() {
    this.cb.onHistoryChange(this.historyIndex > 0, this.historyIndex < this.history.length - 1);
  }

  canUndo() {
    return this.historyIndex > 0;
  }

  canRedo() {
    return this.historyIndex < this.history.length - 1;
  }

  undo() {
    if (!this.canUndo()) return;
    this.historyIndex--;
    this.objects = this.history[this.historyIndex];
    if (this.notebook) this.notebook.objects = this.objects;
    this.pruneSelection();
    this.emitHistory();
    this.cb.onDocumentChange(this.objects);
    this.invalidate();
  }

  redo() {
    if (!this.canRedo()) return;
    this.historyIndex++;
    this.objects = this.history[this.historyIndex];
    if (this.notebook) this.notebook.objects = this.objects;
    this.pruneSelection();
    this.emitHistory();
    this.cb.onDocumentChange(this.objects);
    this.invalidate();
  }

  private commit(objects: NoteObject[]) {
    this.objects = objects;
    if (this.notebook) this.notebook.objects = objects;
    this.pushHistory();
    this.invalidate();
  }

  /* ---------------------------------------------------------------- */
  /* Selection                                                         */
  /* ---------------------------------------------------------------- */

  private selectionBounds(): Bounds | null {
    const list: Bounds[] = [];
    for (const obj of this.objects) if (this.selection.has(obj.id)) list.push(obj.bounds);
    return unionBounds(list);
  }

  private pruneSelection() {
    const ids = new Set(this.objects.map((o) => o.id));
    let changed = false;
    for (const id of [...this.selection]) {
      if (!ids.has(id)) {
        this.selection.delete(id);
        changed = true;
      }
    }
    if (changed) this.emitSelection();
  }

  private emitSelection() {
    const bounds = this.selectionBounds();
    let screen: SelectionInfo['screen'] = null;
    if (bounds) {
      const pad = SELECTION_PAD;
      const tl = this.worldToScreen(bounds.minX, bounds.minY);
      const br = this.worldToScreen(bounds.maxX, bounds.maxY);
      screen = {
        x: tl.x - pad,
        y: tl.y - pad,
        width: br.x - tl.x + pad * 2,
        height: br.y - tl.y + pad * 2,
      };
    }
    const ids = [...this.selection];
    const single = ids.length === 1 ? this.objects.find((o) => o.id === ids[0]) : null;
    this.cb.onSelectionChange({
      ids,
      screen,
      singleTextId: single?.kind === 'text' ? single.id : null,
    });
  }

  clearSelection() {
    if (this.selection.size === 0) return;
    this.selection.clear();
    this.emitSelection();
    this.invalidate(false, true);
  }

  selectAll() {
    this.selection = new Set(this.objects.map((o) => o.id));
    this.emitSelection();
    this.invalidate(false, true);
  }

  deleteSelection() {
    if (this.selection.size === 0) return;
    this.commit(this.objects.filter((o) => !this.selection.has(o.id)));
    this.selection.clear();
    this.emitSelection();
  }

  duplicateSelection() {
    if (this.selection.size === 0) return;
    const offset = 24;
    const copies: NoteObject[] = [];
    for (const obj of this.objects) {
      if (!this.selection.has(obj.id)) continue;
      copies.push(this.translateObject({ ...obj, id: uid(obj.kind) } as NoteObject, offset, offset));
    }
    this.commit([...this.objects, ...copies]);
    this.selection = new Set(copies.map((o) => o.id));
    this.emitSelection();
  }

  /** Move a selected object up or down the z-order. */
  reorderSelection(direction: 'front' | 'back') {
    if (this.selection.size === 0) return;
    const selected = this.objects.filter((o) => this.selection.has(o.id));
    const rest = this.objects.filter((o) => !this.selection.has(o.id));
    this.commit(direction === 'front' ? [...rest, ...selected] : [...selected, ...rest]);
  }

  private translateObject<T extends NoteObject>(obj: T, dx: number, dy: number): T {
    const bounds = translateBounds(obj.bounds, dx, dy);
    if (obj.kind === 'stroke') {
      return {
        ...obj,
        points: obj.points.map((p) => ({ x: p.x + dx, y: p.y + dy, p: p.p })),
        bounds,
      } as T;
    }
    return { ...obj, x: obj.x + dx, y: obj.y + dy, bounds } as T;
  }

  private scaleObject<T extends NoteObject>(
    obj: T,
    anchorX: number,
    anchorY: number,
    factor: number,
  ): T {
    const sx = (v: number) => anchorX + (v - anchorX) * factor;
    const sy = (v: number) => anchorY + (v - anchorY) * factor;
    if (obj.kind === 'stroke') {
      const points = obj.points.map((p) => ({ x: sx(p.x), y: sy(p.y), p: p.p }));
      const size = Math.max(0.4, obj.size * factor);
      return { ...obj, points, size, bounds: strokeBounds({ points, size }) } as T;
    }
    if (obj.kind === 'text') {
      const next = {
        ...obj,
        x: sx(obj.x),
        y: sy(obj.y),
        width: Math.max(24, obj.width * factor),
        fontSize: clamp(obj.fontSize * factor, 6, 400),
      } as TextObject;
      return { ...next, bounds: textBounds(next, this.customFonts) } as unknown as T;
    }
    const x = sx(obj.x);
    const y = sy(obj.y);
    const width = Math.max(8, obj.width * factor);
    const height = Math.max(8, obj.height * factor);
    return { ...obj, x, y, width, height, bounds: { minX: x, minY: y, maxX: x + width, maxY: y + height } } as T;
  }

  /* ---------------------------------------------------------------- */
  /* Hit testing                                                       */
  /* ---------------------------------------------------------------- */

  private hitTest(worldX: number, worldY: number): NoteObject | null {
    const tolerance = 8 / this.scale;
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const obj = this.objects[i];
      if (!boundsContainPoint(obj.bounds, worldX, worldY)) continue;
      if (obj.kind !== 'stroke') return obj;
      if (this.strokeHit(obj, worldX, worldY, tolerance)) return obj;
    }
    return null;
  }

  private strokeHit(stroke: StrokeObject, x: number, y: number, tolerance: number) {
    const reach = stroke.size / 2 + tolerance;
    const reachSq = reach * reach;
    const pts = stroke.points;
    if (pts.length === 1) {
      const dx = pts[0].x - x;
      const dy = pts[0].y - y;
      return dx * dx + dy * dy <= reachSq;
    }
    for (let i = 0; i < pts.length - 1; i++) {
      if (distanceToSegmentSq(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= reachSq) {
        return true;
      }
    }
    return false;
  }

  private handleAt(screenX: number, screenY: number): { anchorX: number; anchorY: number } | null {
    const bounds = this.selectionBounds();
    if (!bounds) return null;
    const pad = SELECTION_PAD / this.scale;
    const corners: [number, number, number, number][] = [
      [bounds.minX - pad, bounds.minY - pad, bounds.maxX + pad, bounds.maxY + pad],
      [bounds.maxX + pad, bounds.minY - pad, bounds.minX - pad, bounds.maxY + pad],
      [bounds.minX - pad, bounds.maxY + pad, bounds.maxX + pad, bounds.minY - pad],
      [bounds.maxX + pad, bounds.maxY + pad, bounds.minX - pad, bounds.minY - pad],
    ];
    const threshold = HANDLE_SIZE + 8;
    for (const [cx, cy, ax, ay] of corners) {
      const s = this.worldToScreen(cx, cy);
      if (Math.hypot(s.x - screenX, s.y - screenY) <= threshold) {
        return { anchorX: ax, anchorY: ay };
      }
    }
    return null;
  }

  private rulerHit(worldX: number, worldY: number): 'body' | 'rotate' | null {
    if (!this.ruler.visible) return null;
    const { x, y, angle, length } = this.ruler;
    const dx = worldX - x;
    const dy = worldY - y;
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    if (Math.abs(localY) > RULER_HALF_WIDTH / 2) return null;
    if (Math.abs(localX) > length / 2) return null;
    const gripDistance = length / 2 - 14 / this.scale;
    if (Math.abs(Math.abs(localX) - gripDistance) < 16 / this.scale) return 'rotate';
    return 'body';
  }

  /* ---------------------------------------------------------------- */
  /* Tool parameters                                                   */
  /* ---------------------------------------------------------------- */

  private inkSize(tool: InkTool): number {
    const raw = this.tools.sizes[tool] ?? 4;
    return clamp(raw, 0.5, 120);
  }

  private eraserSize() {
    return this.inkSize('eraser');
  }

  private inkOpacity(tool: InkTool) {
    switch (tool) {
      case 'highlighter':
        return 0.38;
      case 'pencil':
        return 0.82;
      default:
        return 1;
    }
  }

  private liveToObject(live: LiveStroke): StrokeObject {
    const points = live.points;
    return {
      kind: 'stroke',
      id: uid('stroke'),
      tool: live.tool,
      color: live.color,
      size: live.size,
      opacity: this.inkOpacity(live.tool),
      points,
      simulatePressure: live.simulatePressure,
      bounds: strokeBounds({ points, size: live.size }),
    };
  }

  private updateCursor() {
    if (!this.overlay) return;
    const tool = this.tools.tool;
    this.overlay.style.cursor =
      tool === 'select' ? 'default' : tool === 'text' ? 'text' : tool === 'eraser' ? 'none' : 'crosshair';
  }

  /* ---------------------------------------------------------------- */
  /* Pointer handling                                                  */
  /* ---------------------------------------------------------------- */

  private isToolInput(event: PointerEvent) {
    if (event.pointerType === 'pen' || event.pointerType === 'mouse') return true;
    // Text and select are tap tools, not drawing tools: a finger must always
    // reach them, or they are unusable on an iPad without a stylus. Two
    // fingers still pan and zoom.
    if (this.tools.tool === 'text' || this.tools.tool === 'select') return true;
    return this.tools.fingerDraws;
  }

  private handlePointerDown = (event: PointerEvent) => {
    if (!this.notebook) return;
    // A stylus takes priority: while it is down, every touch is a resting palm.
    if (this.penActive && event.pointerType === 'touch') return;
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1) return;

    event.preventDefault();
    this.overlay?.setPointerCapture(event.pointerId);

    const { x, y } = this.eventPoint(event);
    const now = performance.now();
    this.pointers.set(event.pointerId, {
      id: event.pointerId,
      type: event.pointerType,
      x,
      y,
      startX: x,
      startY: y,
      startTime: now,
    });

    if (event.pointerType === 'pen') {
      this.penActive = true;
      // Drop any touch pointers that arrived first (palm landing before the tip).
      for (const [id, p] of [...this.pointers]) {
        if (p.type === 'touch') this.pointers.delete(id);
      }
      if (this.mode.kind === 'pan' || this.mode.kind === 'gesture') this.mode = { kind: 'idle' };
    }

    const touchCount = [...this.pointers.values()].filter((p) => p.type === 'touch').length;

    // A second finger always means navigation, even mid-stroke.
    if (event.pointerType === 'touch' && touchCount >= 2) {
      this.abortLiveStroke();
      this.beginGesture();
      return;
    }

    // An open text box owns the next tap: commit what was typed rather than
    // discarding it by opening a second editor on top.
    if (this.textEditActive) {
      this.pointers.delete(event.pointerId);
      this.releaseCapture(event.pointerId);
      this.cb.onCommitPendingText();
      return;
    }

    const world = this.screenToWorld(x, y);

    // Middle mouse or space-drag style panning.
    if (event.pointerType === 'mouse' && event.button === 1) {
      this.mode = { kind: 'pan', pointerId: event.pointerId, lastX: x, lastY: y };
      return;
    }

    if (!this.isToolInput(event)) {
      this.gestureMaxPointers = touchCount;
      this.gestureMoved = 0;
      this.mode = { kind: 'pan', pointerId: event.pointerId, lastX: x, lastY: y };
      return;
    }

    // Ruler manipulation beats every tool.
    const rulerPart = this.rulerHit(world.x, world.y);
    if (rulerPart === 'rotate') {
      this.mode = { kind: 'rotate-ruler', pointerId: event.pointerId };
      return;
    }
    if (rulerPart === 'body' && this.tools.tool === 'select') {
      this.mode = { kind: 'move-ruler', pointerId: event.pointerId, lastX: x, lastY: y };
      return;
    }

    switch (this.tools.tool) {
      case 'select':
        this.beginSelectInteraction(event, x, y, world);
        break;
      case 'text':
        this.handleTextTap(world);
        break;
      case 'eraser':
        if (this.tools.eraserMode === 'stroke') {
          this.mode = { kind: 'erase-stroke', pointerId: event.pointerId, last: world };
          this.eraseStrokesAt(world, world);
        } else {
          this.beginStroke(event, world);
        }
        this.eraserCursor = { x, y };
        this.invalidate(false, true);
        break;
      default:
        this.beginStroke(event, world);
        break;
    }
  };

  private handlePointerMove = (event: PointerEvent) => {
    if (this.penActive && event.pointerType === 'touch') return;
    const pointer = this.pointers.get(event.pointerId);

    if (this.tools.tool === 'eraser' && event.pointerType !== 'touch') {
      const p = this.eventPoint(event);
      this.eraserCursor = p;
      this.invalidate(false, true);
    }

    if (!pointer) return;
    event.preventDefault();

    const { x, y } = this.eventPoint(event);
    this.gestureMoved += Math.hypot(x - pointer.x, y - pointer.y);
    pointer.x = x;
    pointer.y = y;

    switch (this.mode.kind) {
      case 'gesture':
        this.updateGesture();
        break;
      case 'pan': {
        if (this.mode.pointerId !== event.pointerId) return;
        const dx = x - this.mode.lastX;
        const dy = y - this.mode.lastY;
        this.mode.lastX = x;
        this.mode.lastY = y;
        this.setViewport(this.scale, this.offsetX + dx, this.offsetY + dy);
        break;
      }
      case 'draw':
        if (this.mode.pointerId !== event.pointerId) return;
        this.extendStroke(event);
        break;
      case 'erase-stroke': {
        if (this.mode.pointerId !== event.pointerId) return;
        const world = this.screenToWorld(x, y);
        this.eraseStrokesAt(this.mode.last, world);
        this.mode.last = world;
        break;
      }
      case 'lasso': {
        if (this.mode.pointerId !== event.pointerId) return;
        const world = this.screenToWorld(x, y);
        this.mode.points.push(world);
        this.lassoPoints = this.mode.points;
        this.invalidate(false, true);
        break;
      }
      case 'move-selection': {
        if (this.mode.pointerId !== event.pointerId) return;
        const dx = (x - this.mode.lastX) / this.scale;
        const dy = (y - this.mode.lastY) / this.scale;
        this.mode.lastX = x;
        this.mode.lastY = y;
        this.mode.moved = true;
        this.objects = this.objects.map((o) =>
          this.selection.has(o.id) ? this.translateObject(o, dx, dy) : o,
        );
        if (this.notebook) this.notebook.objects = this.objects;
        this.invalidate();
        this.emitSelection();
        break;
      }
      case 'scale-selection': {
        if (this.mode.pointerId !== event.pointerId) return;
        const world = this.screenToWorld(x, y);
        const currentDistance = Math.hypot(world.x - this.mode.anchorX, world.y - this.mode.anchorY);
        const factor = clamp(currentDistance / this.mode.startDistance, 0.05, 30);
        const anchorX = this.mode.anchorX;
        const anchorY = this.mode.anchorY;
        const originals = new Map(this.mode.startObjects.map((o) => [o.id, o]));
        this.objects = this.objects.map((o) => {
          const original = originals.get(o.id);
          return original ? this.scaleObject(original, anchorX, anchorY, factor) : o;
        });
        if (this.notebook) this.notebook.objects = this.objects;
        this.invalidate();
        this.emitSelection();
        break;
      }
      case 'move-ruler': {
        if (this.mode.pointerId !== event.pointerId) return;
        const dx = (x - this.mode.lastX) / this.scale;
        const dy = (y - this.mode.lastY) / this.scale;
        this.mode.lastX = x;
        this.mode.lastY = y;
        this.ruler = { ...this.ruler, x: this.ruler.x + dx, y: this.ruler.y + dy };
        this.cb.onRulerChange(this.getRuler());
        this.invalidate(false, true);
        break;
      }
      case 'rotate-ruler': {
        if (this.mode.pointerId !== event.pointerId) return;
        const world = this.screenToWorld(x, y);
        this.ruler = {
          ...this.ruler,
          angle: Math.atan2(world.y - this.ruler.y, world.x - this.ruler.x),
        };
        this.cb.onRulerChange(this.getRuler());
        this.invalidate(false, true);
        break;
      }
      default:
        break;
    }
  };

  private handlePointerUp = (event: PointerEvent) => {
    const pointer = this.pointers.get(event.pointerId);
    if (event.pointerType === 'pen') this.penActive = false;
    if (!pointer) {
      this.releaseCapture(event.pointerId);
      return;
    }
    event.preventDefault();

    const duration = performance.now() - pointer.startTime;
    const travel = Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY);
    this.pointers.delete(event.pointerId);
    this.releaseCapture(event.pointerId);

    switch (this.mode.kind) {
      case 'draw':
        this.finishStroke();
        break;
      case 'erase-stroke':
        if (this.eraseDirty) {
          this.pushHistory();
          this.eraseDirty = false;
        }
        break;
      case 'lasso':
        this.finishLasso();
        break;
      case 'move-selection':
        if (this.mode.moved) this.pushHistory();
        break;
      case 'scale-selection':
        this.pushHistory();
        break;
      case 'pan':
      case 'gesture':
        this.finishNavigation(pointer, duration, travel);
        break;
      default:
        break;
    }

    if (this.pointers.size === 0) {
      this.mode = { kind: 'idle' };
      this.pinch = null;
      this.gestureMaxPointers = 0;
      this.gestureMoved = 0;
    } else if (this.mode.kind === 'gesture') {
      this.resyncGesture();
    }

    if (event.pointerType !== 'mouse') this.eraserCursor = null;
    this.invalidate(false, true);
  };

  private handlePointerCancel = (event: PointerEvent) => {
    if (event.pointerType === 'pen') this.penActive = false;
    this.pointers.delete(event.pointerId);
    this.releaseCapture(event.pointerId);
    if (this.mode.kind === 'draw') this.finishStroke();
    if (this.pointers.size === 0) {
      this.mode = { kind: 'idle' };
      this.pinch = null;
    }
    this.eraserCursor = null;
    this.invalidate(false, true);
  };

  private releaseCapture(pointerId: number) {
    try {
      if (this.overlay?.hasPointerCapture(pointerId)) {
        this.overlay.releasePointerCapture(pointerId);
      }
    } catch {
      /* pointer already gone */
    }
  }

  /* ---------------------------------------------------------------- */
  /* Drawing                                                           */
  /* ---------------------------------------------------------------- */

  private beginStroke(event: PointerEvent, world: { x: number; y: number }) {
    const tool = this.tools.tool as InkTool;
    const size = this.inkSize(tool);
    const color = tool === 'eraser' ? '#000000' : this.tools.colors[tool];

    // Drawing along the ruler snaps the whole stroke to its edge.
    let snapAngle: number | null = null;
    let snapOrigin: { x: number; y: number } | null = null;
    if (this.ruler.visible) {
      const projection = projectOntoLine(world.x, world.y, this.ruler.x, this.ruler.y, this.ruler.angle);
      if (projection.distance < RULER_SNAP_DISTANCE / this.scale + RULER_HALF_WIDTH / 2) {
        snapAngle = this.ruler.angle;
        snapOrigin = { x: this.ruler.x, y: this.ruler.y };
        world = { x: projection.x, y: projection.y };
      }
    }

    this.live = {
      tool,
      color,
      size,
      opacity: this.inkOpacity(tool),
      points: [{ x: world.x, y: world.y, p: readPressure(event) }],
      simulatePressure: !isPressureCapable(event),
      snapAngle,
      snapOrigin,
    };
    this.mode = { kind: 'draw', pointerId: event.pointerId };
    this.invalidate(tool === 'eraser', true);
  }

  private extendStroke(event: PointerEvent) {
    const live = this.live;
    if (!live) return;
    const samples =
      typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
    const rect = this.overlay?.getBoundingClientRect();
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;

    for (const sample of samples.length > 0 ? samples : [event]) {
      let wx = (sample.clientX - left - this.offsetX) / this.scale;
      let wy = (sample.clientY - top - this.offsetY) / this.scale;
      if (live.snapAngle !== null && live.snapOrigin) {
        const projected = projectOntoLine(wx, wy, live.snapOrigin.x, live.snapOrigin.y, live.snapAngle);
        wx = projected.x;
        wy = projected.y;
      }
      live.points.push({ x: wx, y: wy, p: readPressure(sample) });
    }
    this.invalidate(live.tool === 'eraser', true);
  }

  private finishStroke() {
    const live = this.live;
    this.live = null;
    if (!live || live.points.length === 0) {
      this.invalidate();
      return;
    }
    // Ignore accidental specks from a resting palm or a stray tap.
    if (live.points.length < 2) {
      const only = live.points[0];
      live.points.push({ x: only.x + 0.6, y: only.y + 0.6, p: only.p });
    }
    const stroke = this.liveToObject(live);
    this.commit([...this.objects, stroke]);
  }

  private abortLiveStroke() {
    if (!this.live) return;
    this.live = null;
    this.mode = { kind: 'idle' };
    this.invalidate();
  }

  private eraseDirty = false;

  private eraseStrokesAt(from: { x: number; y: number }, to: { x: number; y: number }) {
    const radius = this.eraserSize() / 2 + 2 / this.scale;
    const survivors: NoteObject[] = [];
    let removed = false;

    const probe: Bounds = {
      minX: Math.min(from.x, to.x) - radius,
      minY: Math.min(from.y, to.y) - radius,
      maxX: Math.max(from.x, to.x) + radius,
      maxY: Math.max(from.y, to.y) + radius,
    };

    for (const obj of this.objects) {
      if (!boundsIntersect(obj.bounds, probe)) {
        survivors.push(obj);
        continue;
      }
      if (obj.kind === 'stroke') {
        const reach = radius + obj.size / 2;
        const reachSq = reach * reach;
        let hit = false;
        const pts = obj.points;
        for (let i = 0; i < pts.length && !hit; i++) {
          // Test the stroke's points against the eraser's travel segment.
          if (distanceToSegmentSq(pts[i].x, pts[i].y, from.x, from.y, to.x, to.y) <= reachSq) {
            hit = true;
          }
        }
        if (hit) {
          removed = true;
          continue;
        }
      }
      survivors.push(obj);
    }

    if (removed) {
      this.objects = survivors;
      if (this.notebook) this.notebook.objects = survivors;
      this.eraseDirty = true;
      this.pruneSelection();
      this.invalidate();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Selection interaction                                             */
  /* ---------------------------------------------------------------- */

  private beginSelectInteraction(
    event: PointerEvent,
    screenX: number,
    screenY: number,
    world: { x: number; y: number },
  ) {
    const handle = this.handleAt(screenX, screenY);
    if (handle && this.selection.size > 0) {
      const startDistance = Math.hypot(world.x - handle.anchorX, world.y - handle.anchorY);
      if (startDistance > 1) {
        this.mode = {
          kind: 'scale-selection',
          pointerId: event.pointerId,
          anchorX: handle.anchorX,
          anchorY: handle.anchorY,
          startDistance,
          startObjects: this.objects.filter((o) => this.selection.has(o.id)),
        };
        return;
      }
    }

    const now = performance.now();
    const isDoubleTap =
      now - this.lastTapTime < DOUBLE_TAP_MS &&
      Math.hypot(screenX - this.lastTapX, screenY - this.lastTapY) < 24;
    this.lastTapTime = now;
    this.lastTapX = screenX;
    this.lastTapY = screenY;

    const hit = this.hitTest(world.x, world.y);

    if (hit && isDoubleTap && hit.kind === 'text') {
      this.beginEditingText(hit);
      return;
    }

    const bounds = this.selectionBounds();
    const insideSelection =
      bounds !== null &&
      boundsContainPoint(
        {
          minX: bounds.minX - SELECTION_PAD / this.scale,
          minY: bounds.minY - SELECTION_PAD / this.scale,
          maxX: bounds.maxX + SELECTION_PAD / this.scale,
          maxY: bounds.maxY + SELECTION_PAD / this.scale,
        },
        world.x,
        world.y,
      );

    if (hit && (this.selection.has(hit.id) || insideSelection)) {
      this.mode = {
        kind: 'move-selection',
        pointerId: event.pointerId,
        lastX: screenX,
        lastY: screenY,
        moved: false,
      };
      return;
    }

    if (hit) {
      const additive = event.shiftKey;
      if (!additive) this.selection.clear();
      this.selection.add(hit.id);
      this.emitSelection();
      this.mode = {
        kind: 'move-selection',
        pointerId: event.pointerId,
        lastX: screenX,
        lastY: screenY,
        moved: false,
      };
      this.invalidate(false, true);
      return;
    }

    if (insideSelection) {
      this.mode = {
        kind: 'move-selection',
        pointerId: event.pointerId,
        lastX: screenX,
        lastY: screenY,
        moved: false,
      };
      return;
    }

    if (!event.shiftKey) this.clearSelection();
    this.mode = { kind: 'lasso', pointerId: event.pointerId, points: [world] };
    this.lassoPoints = [world];
  }

  private finishLasso() {
    const polygon = this.lassoPoints;
    this.lassoPoints = [];
    if (polygon.length < 3) {
      this.invalidate(false, true);
      return;
    }
    const hits = new Set<string>(this.selection);
    for (const obj of this.objects) {
      if (this.objectInPolygon(obj, polygon)) hits.add(obj.id);
    }
    this.selection = hits;
    this.emitSelection();
    this.invalidate(false, true);
  }

  private objectInPolygon(obj: NoteObject, polygon: { x: number; y: number }[]) {
    if (obj.kind === 'stroke') {
      // Require most of the stroke inside, so a lasso edge does not grab
      // everything it merely brushes past.
      let inside = 0;
      for (const p of obj.points) if (pointInPolygon(p.x, p.y, polygon)) inside++;
      return inside > obj.points.length * 0.6;
    }
    const { minX, minY, maxX, maxY } = obj.bounds;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return pointInPolygon(cx, cy, polygon);
  }

  /* ---------------------------------------------------------------- */
  /* Text                                                              */
  /* ---------------------------------------------------------------- */

  private handleTextTap(world: { x: number; y: number }) {
    const hit = this.hitTest(world.x, world.y);
    if (hit && hit.kind === 'text') {
      this.beginEditingText(hit);
      return;
    }
    this.beginNewText(world);
  }

  private beginNewText(world: { x: number; y: number }) {
    const notebook = this.notebook;
    if (!notebook) return;
    const { width: pageWidth } = getPageSize(notebook.pageFormat);
    const fontSize = clamp(this.tools.sizes.text ?? 18, 8, 200);

    // Snap the baseline to the nearest rule, but keep the x where the user
    // actually tapped. The old build forced every text box to x=40, so you
    // could never place text anywhere but the left margin.
    let y = world.y;
    const lineHeight = getLineHeight(notebook);
    if (lineHeight > 1) {
      const stride = getPageSize(notebook.pageFormat).height + PAGE_GAP;
      const pageIndex = Math.max(0, Math.floor(world.y / stride));
      const pageTop = pageIndex * stride;
      const onPage = world.y - pageTop;
      const nearest = Math.round(onPage / lineHeight) * lineHeight;
      if (Math.abs(onPage - nearest) < lineHeight * 0.5) {
        y = pageTop + nearest - fontSize;
      }
    }

    const x = clamp(world.x, 0, Math.max(0, pageWidth - 80));
    const width = Math.max(120, Math.min(pageWidth - PAGE_MARGIN, pageWidth - x - 16));

    this.editingTextId = null;
    this.textEditActive = true;
    this.cb.onTextEdit({
      id: uid('text'),
      isNew: true,
      text: '',
      x,
      y,
      width,
      fontSize,
      fontFamily: this.tools.fontFamily,
      color: this.tools.colors.text,
    });
  }

  private beginEditingText(obj: TextObject) {
    this.editingTextId = obj.id;
    this.textEditActive = true;
    this.invalidate(true, false);
    this.cb.onTextEdit({
      id: obj.id,
      isNew: false,
      text: obj.text,
      x: obj.x,
      y: obj.y,
      width: obj.width,
      fontSize: obj.fontSize,
      fontFamily: obj.fontFamily,
      color: obj.color,
    });
  }

  editSelectedText() {
    const ids = [...this.selection];
    if (ids.length !== 1) return;
    const obj = this.objects.find((o) => o.id === ids[0]);
    if (obj?.kind === 'text') this.beginEditingText(obj);
  }

  /** Screen rectangle for the text editing overlay. */
  textEditScreenRect(request: TextEditRequest) {
    const topLeft = this.worldToScreen(request.x, request.y);
    return {
      left: topLeft.x,
      top: topLeft.y,
      width: request.width * this.scale,
      fontSize: request.fontSize * this.scale,
      lineHeight: lineHeightFor(request.fontSize) * this.scale,
      scale: this.scale,
    };
  }

  commitTextEdit(request: TextEditRequest, text: string) {
    this.editingTextId = null;
    this.textEditActive = false;
    const trimmed = text.replace(/\s+$/, '');

    if (!trimmed) {
      // Empty text deletes the object rather than leaving an invisible one.
      if (!request.isNew) {
        this.commit(this.objects.filter((o) => o.id !== request.id));
      } else {
        this.invalidate();
      }
      this.cb.onTextEdit(null);
      return;
    }

    const draft: TextObject = {
      kind: 'text',
      id: request.id,
      text: trimmed,
      x: request.x,
      y: request.y,
      width: request.width,
      fontSize: request.fontSize,
      fontFamily: request.fontFamily,
      color: request.color,
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    };
    draft.bounds = textBounds(draft, this.customFonts);

    if (request.isNew) {
      this.commit([...this.objects, draft]);
    } else {
      this.commit(this.objects.map((o) => (o.id === request.id ? draft : o)));
    }
    this.cb.onTextEdit(null);
  }

  cancelTextEdit() {
    this.textEditActive = false;
    if (this.editingTextId !== null) {
      this.editingTextId = null;
      this.invalidate(true, false);
    }
    this.cb.onTextEdit(null);
  }

  /** Re-measure text after a custom font finishes rasterising. */
  refreshTextBounds() {
    let changed = false;
    const next = this.objects.map((o) => {
      if (o.kind !== 'text') return o;
      const bounds = textBounds(o, this.customFonts);
      if (
        bounds.maxX === o.bounds.maxX &&
        bounds.maxY === o.bounds.maxY &&
        bounds.minX === o.bounds.minX &&
        bounds.minY === o.bounds.minY
      ) {
        return o;
      }
      changed = true;
      return { ...o, bounds };
    });
    if (changed) {
      this.objects = next;
      if (this.notebook) this.notebook.objects = next;
    }
    this.invalidate();
  }

  /* ---------------------------------------------------------------- */
  /* Images                                                            */
  /* ---------------------------------------------------------------- */

  async insertImage(file: Blob): Promise<void> {
    const notebook = this.notebook;
    if (!notebook) return;
    const assetId = uid('img');
    try {
      await putAsset(assetId, file);
    } catch (err) {
      this.cb.onError(
        err instanceof Error ? err.message : 'Could not save that image to local storage.',
      );
      return;
    }

    const image = await requestImage(assetId);
    if (!image) {
      this.cb.onError('That image could not be decoded.');
      return;
    }

    const { width: pageWidth } = getPageSize(notebook.pageFormat);
    const maxWidth = pageWidth - PAGE_MARGIN * 2;
    const scale = Math.min(1, maxWidth / image.naturalWidth);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;

    // Drop it in the middle of what the user is currently looking at.
    const centre = this.screenToWorld(this.width / 2, this.height / 2);
    const x = clamp(centre.x - width / 2, 8, Math.max(8, pageWidth - width - 8));
    const y = centre.y - height / 2;

    const obj: ImageObject = {
      kind: 'image',
      id: uid('image'),
      src: assetId,
      x,
      y,
      width,
      height,
      bounds: { minX: x, minY: y, maxX: x + width, maxY: y + height },
    };
    this.commit([...this.objects, obj]);
    this.selection = new Set([obj.id]);
    this.emitSelection();
  }

  /* ---------------------------------------------------------------- */
  /* Navigation gestures                                               */
  /* ---------------------------------------------------------------- */

  private beginGesture() {
    this.mode = { kind: 'gesture' };
    this.gestureMoved = 0;
    this.resyncGesture();
  }

  private resyncGesture() {
    const touches = [...this.pointers.values()].filter((p) => p.type === 'touch');
    this.gestureMaxPointers = Math.max(this.gestureMaxPointers, touches.length);
    if (touches.length >= 2) {
      const [a, b] = touches;
      this.pinch = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        centerX: (a.x + b.x) / 2,
        centerY: (a.y + b.y) / 2,
      };
    } else if (touches.length === 1) {
      this.pinch = null;
      this.mode = { kind: 'pan', pointerId: touches[0].id, lastX: touches[0].x, lastY: touches[0].y };
    } else {
      this.pinch = null;
    }
  }

  private updateGesture() {
    const touches = [...this.pointers.values()].filter((p) => p.type === 'touch');
    if (touches.length < 2 || !this.pinch) return;
    const [a, b] = touches;
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const centerX = (a.x + b.x) / 2;
    const centerY = (a.y + b.y) / 2;

    const factor = this.pinch.distance > 0 ? distance / this.pinch.distance : 1;
    const nextScale = clamp(this.scale * factor, this.minScale(), MAX_SCALE);

    // Zoom about the pinch centre while also following its translation, so
    // two fingers pan and zoom in a single continuous motion.
    const world = this.screenToWorld(this.pinch.centerX, this.pinch.centerY);
    const offsetX = centerX - world.x * nextScale;
    const offsetY = centerY - world.y * nextScale;

    this.pinch = { distance, centerX, centerY };
    this.setViewport(nextScale, offsetX, offsetY);
  }

  private finishNavigation(pointer: ActivePointer, duration: number, travel: number) {
    if (!this.settings.gestureShortcuts) return;
    if (pointer.type !== 'touch') return;
    // Only the last finger of the gesture reports the tap.
    if (this.pointers.size > 0) return;
    if (duration > TAP_MAX_MS || travel > TAP_MAX_MOVE) return;
    if (this.gestureMoved > TAP_MAX_MOVE * this.gestureMaxPointers) return;

    if (this.gestureMaxPointers === 2) this.undo();
    else if (this.gestureMaxPointers === 3) this.redo();
  }

  private handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    const { x, y } = this.eventPoint(event);

    // Trackpad pinch and ctrl+wheel both arrive as a wheel event with ctrlKey.
    if (event.ctrlKey || event.metaKey) {
      const factor = Math.exp(-event.deltaY * 0.01);
      this.zoomBy(factor, x, y);
      return;
    }

    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1;
    let dx = event.deltaX * unit;
    let dy = event.deltaY * unit;
    if (event.shiftKey && dx === 0) {
      dx = dy;
      dy = 0;
    }
    this.setViewport(this.scale, this.offsetX - dx, this.offsetY - dy);
  };

  /* ---------------------------------------------------------------- */
  /* Keyboard                                                          */
  /* ---------------------------------------------------------------- */

  handleKeyDown(event: KeyboardEvent): boolean {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return true;
    }
    if (mod && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.redo();
      return true;
    }
    if (mod && event.key.toLowerCase() === 'a' && this.tools.tool === 'select') {
      event.preventDefault();
      this.selectAll();
      return true;
    }
    if (mod && event.key.toLowerCase() === 'd' && this.selection.size > 0) {
      event.preventDefault();
      this.duplicateSelection();
      return true;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && this.selection.size > 0) {
      event.preventDefault();
      this.deleteSelection();
      return true;
    }
    if (event.key === 'Escape') {
      if (this.selection.size > 0) {
        this.clearSelection();
        return true;
      }
    }
    if (mod && (event.key === '=' || event.key === '+')) {
      event.preventDefault();
      this.zoomBy(1.2);
      return true;
    }
    if (mod && event.key === '-') {
      event.preventDefault();
      this.zoomBy(1 / 1.2);
      return true;
    }
    if (mod && event.key === '0') {
      event.preventDefault();
      this.resetZoom();
      return true;
    }
    if (!mod && (event.key === 'PageDown' || event.key === 'PageUp')) {
      event.preventDefault();
      const direction = event.key === 'PageDown' ? 1 : -1;
      this.setViewport(this.scale, this.offsetX, this.offsetY - direction * this.height * 0.9);
      return true;
    }
    return false;
  }
}

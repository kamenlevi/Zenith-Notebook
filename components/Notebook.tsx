import React, { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Toolbar } from './Toolbar';
import { PrintModal } from './PrintModal';
import { SizeSlider } from './SizeSlider';
import type { Subject, ToolSettings, Theme, CustomFont, ImageObject, DrawingObject, Path, TextObject } from '../types';
import { ToolType } from '../types';
import { drawPageBackground, drawSmoothPath, drawTextOnCanvas } from './canvasUtils';

interface NotebookProps {
  subject: Subject;
  onSaveCanvas: (id: string, canvasState: DrawingObject[]) => void;
  onUpdateImages: (id: string, images: ImageObject[]) => void;
  onPageCountChange: (id: string, pageCount: number) => void;
  theme: Theme;
  onThemeChange: () => void;
  onOpenPageStyleSettings: () => void;
  customFonts: CustomFont[];
  onOpenCreateFont: () => void;
  isRulerVisible: boolean;
  onToggleRuler: () => void;
}

const PAGE_HEIGHT = 1056;
const PAGE_WIDTH = 816;
const PAGE_GAP = 24;
const DPI = 96;
const CM_TO_INCH = 1 / 2.54;
const cmToPx = (cm: number) => cm * CM_TO_INCH * DPI;
const TAP_TIMEOUT = 250;
const TAP_MOVE_THRESHOLD = 15;
const SCROLL_DAMPING = 0.95;
const QUICK_ZOOM_RESET_THRESHOLD = 0.6;
const TEXT_SNAP_MARGIN = 40;
const TEXT_SNAP_THRESHOLD = 16;

interface TransformState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface EditingTextState {
  x: number; // World coordinates
  y: number; // World coordinates
  fontSize: number;
}

interface PointerInteractionState {
  isMovingImage: boolean;
  selectedImageId: string | null;
  pointerOffset: { x: number; y: number }; // World coordinates
}

const getStrokeWidth = (tool: ToolType, sliderValue: number): number => {
  const normalizedValue = sliderValue / 100; // 0 to 1
  const power = 2;
  
  const minPenSize = 0.5;
  const maxPenSize = 50;
  const penSize = minPenSize + Math.pow(normalizedValue, power) * (maxPenSize - minPenSize);

  switch (tool) {
    case ToolType.Pen:
    case ToolType.Pencil:
      return penSize;
    case ToolType.Highlighter:
    case ToolType.Eraser:
      return penSize * 5;
    default:
      return sliderValue;
  }
};

export const Notebook = forwardRef<
  { renderFullCanvas: () => Promise<HTMLCanvasElement | null> },
  NotebookProps
>(({ subject, onSaveCanvas, onUpdateImages, onPageCountChange, theme, onThemeChange, onOpenPageStyleSettings, customFonts, onOpenCreateFont, isRulerVisible, onToggleRuler }, ref) => {
  const [numPages, setNumPages] = useState(subject.pageCount);
  const offscreenCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const offscreenContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const contentCanvasRef = useRef<HTMLCanvasElement>(null);
  const contentContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const uiCanvasRef = useRef<HTMLCanvasElement>(null);
  const uiContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const [drawingObjects, setDrawingObjects] = useState<DrawingObject[]>(() => Array.isArray(subject.canvasState) ? subject.canvasState : []);
  const currentPathRef = useRef<Path | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const [toolSettings, setToolSettings] = useState<ToolSettings>({
    tool: ToolType.Pen,
    color: theme === 'light' ? '#000000' : '#FFFFFF',
    size: 25,
    fontFamily: 'Lora',
  });
  const [editingText, setEditingText] = useState<EditingTextState | null>(null);
  const [fontImageCache, setFontImageCache] = useState<Map<string, { image: HTMLCanvasElement, width: number, yOffset: number }>>(new Map());
  const [images, setImages] = useState<ImageObject[]>(() => subject.images || []);
  const imageRefs = useRef<Map<string, HTMLImageElement>>(new Map());
  const viewportRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<DrawingObject[][]>([drawingObjects]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [transform, setTransform] = useState<TransformState>({ scale: 1, offsetX: (viewportRef.current?.clientWidth ?? window.innerWidth) / 2 - PAGE_WIDTH / 2, offsetY: 0 });
  
  const pointersRef = useRef<Map<number, React.PointerEvent<HTMLCanvasElement>>>(new Map());
  const prevGestureRef = useRef<{ distance: number; center: { x: number; y: number } } | null>(null);
  const pointerInteractionRef = useRef<PointerInteractionState>({ isMovingImage: false, selectedImageId: null, pointerOffset: { x: 0, y: 0 }});
  const lastTapInfoRef = useRef<{ time: number; pointerCount: number; positions: Map<number, { x: number; y: number }> } | null>(null);
  const isPanningRef = useRef(false);
  const lastPanPoint = useRef({ x: 0, y: 0 });
  const scrollVelocityY = useRef(0);
  const animationFrameId = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nextTextOpenerRef = useRef<{ x: number, y: number } | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  
  const undoTimeoutRef = useRef<number | null>(null);
  const undoIntervalRef = useRef<number | null>(null);
  const undoSpeedTimeoutRef = useRef<number | null>(null);
  const redoTimeoutRef = useRef<number | null>(null);
  const redoIntervalRef = useRef<number | null>(null);
  const redoSpeedTimeoutRef = useRef<number | null>(null);

  const totalHeight = numPages * PAGE_HEIGHT + (numPages > 0 ? (numPages - 1) * PAGE_GAP : 0);

  const notebookStateRef = useRef({
    subject, toolSettings, transform, drawingObjects, images, customFonts,
    fontImageCache, isDrawing, editingText, getLineHeight: (s: Subject): number => 0,
    history, historyIndex, numPages, totalHeight
  });

  useEffect(() => {
    notebookStateRef.current = {
      subject, toolSettings, transform, drawingObjects, images, customFonts,
      fontImageCache, isDrawing, editingText, getLineHeight,
      history, historyIndex, numPages, totalHeight
    };
  }, [
    subject, toolSettings, transform, drawingObjects, images, customFonts,
    fontImageCache, isDrawing, editingText, history, historyIndex, numPages, totalHeight
  ]);

  useEffect(() => {
    onUpdateImages(subject.id, images);
    if (saveTimeoutRef.current !== null) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(() => {
        onSaveCanvas(subject.id, drawingObjects);
    }, 1000);
  }, [images, subject.id, onUpdateImages, drawingObjects, onSaveCanvas]);

  const getLineHeight = useCallback((s: Subject): number => {
    switch (s.pageBackground) {
        case 'ruled': return 28;
        case 'grid': return 28;
        case 'custom-ruled': return cmToPx(s.lineSpacingCm);
        default: return 0;
    }
  }, []);

  useEffect(() => {
    const FONT_DRAW_CANVAS_BASELINE = 300;
    const analyzeAndTrimCharacter = (img: HTMLImageElement): { image: HTMLCanvasElement, width: number, yOffset: number } => {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
        if (!tempCtx) return { image: img as any, width: img.width / 4, yOffset: 0 };
        tempCanvas.width = img.width; tempCanvas.height = img.height;
        tempCtx.drawImage(img, 0, 0);
        const data = tempCtx.getImageData(0, 0, img.width, img.height).data;
        let minX = img.width, maxX = -1, maxY = -1;
        for (let y = 0; y < img.height; y++) {
            for (let x = 0; x < img.width; x++) {
                if (data[(y * img.width + x) * 4 + 3] > 10) {
                    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX === -1) {
            const spaceCanvas = document.createElement('canvas'); spaceCanvas.width = 1; spaceCanvas.height = 1;
            return { image: spaceCanvas, width: img.width / 4, yOffset: 0 }; 
        }
        const trimmedWidth = Math.max(1, maxX - minX + 1);
        const newCanvas = document.createElement('canvas'); newCanvas.width = trimmedWidth; newCanvas.height = img.height;
        const newCtx = newCanvas.getContext('2d');
        if (!newCtx) return { image: img as any, width: img.width / 4, yOffset: 0 };
        newCtx.drawImage(tempCanvas, minX, 0, trimmedWidth, img.height, 0, 0, trimmedWidth, img.height);
        const yOffset = maxY - FONT_DRAW_CANVAS_BASELINE;
        return { image: newCanvas, width: trimmedWidth, yOffset };
    };

    const fontId = toolSettings.fontFamily;
    const customFont = customFonts.find(f => f.id === fontId);
    if (customFont) {
      const newCache = new Map<string, { image: HTMLCanvasElement, width: number, yOffset: number }>();
      const promises = Object.entries(customFont.characters).map(([char, dataUrl]) => {
        return new Promise<void>(resolve => {
          if (!dataUrl.startsWith('data:image')) { resolve(); return; }
          const img = new Image();
          img.onload = () => {
            const { image: analyzedImage, width, yOffset } = analyzeAndTrimCharacter(img);
            const colorCanvas = document.createElement('canvas');
            colorCanvas.width = analyzedImage.width; colorCanvas.height = analyzedImage.height;
            const colorCtx = colorCanvas.getContext('2d');
            if (colorCtx) {
                colorCtx.drawImage(analyzedImage, 0, 0);
                colorCtx.globalCompositeOperation = 'source-in';
                colorCtx.fillStyle = toolSettings.color;
                colorCtx.fillRect(0, 0, analyzedImage.width, analyzedImage.height);
            }
            newCache.set(char, { image: colorCanvas, width, yOffset });
            resolve();
          };
          img.onerror = () => resolve();
          img.src = dataUrl;
        });
      });
      Promise.all(promises).then(() => setFontImageCache(newCache));
    } else {
      setFontImageCache(new Map());
    }
  }, [toolSettings.fontFamily, toolSettings.color, customFonts]);

  const drawScene = useCallback(() => {
    const context = contentContextRef.current;
    const canvas = contentCanvasRef.current;
    const offscreen = offscreenCanvasRef.current;
    if (!context || !canvas || !offscreen) return;

    const { scale, offsetX, offsetY } = notebookStateRef.current.transform;
    const { width, height } = canvas.getBoundingClientRect();
    context.clearRect(0, 0, width, height);

    const sx = (-offsetX / scale);
    const sy = (-offsetY / scale);
    const sw = width / scale;
    const sh = height / scale;

    context.drawImage(offscreen, sx, sy, sw, sh, 0, 0, width, height);
  }, []);
  
  useEffect(() => { requestAnimationFrame(drawScene); }, [drawScene, transform]);
  
  useEffect(() => {
    const renderOffscreen = async () => {
        const offscreen = offscreenCanvasRef.current;
        const context = offscreenContextRef.current;
        if (!context) return;
        
        offscreen.width = PAGE_WIDTH;
        offscreen.height = totalHeight;

        for(let i = 0; i < numPages; i++) {
            drawPageBackground(context, subject, i, totalHeight);
        }
        drawingObjects.forEach(obj => {
            if (obj.tool === ToolType.Text) {
                drawTextOnCanvas(context, obj as TextObject, customFonts, fontImageCache);
            } else {
                drawSmoothPath(context, obj as Path);
            }
        });

        context.globalCompositeOperation = 'source-over';
        context.globalAlpha = 1;
        const imagePromises = images.map(imgObj => {
            return new Promise<void>(resolve => {
                const imgElement = imageRefs.current.get(imgObj.id);
                if (imgElement && imgElement.complete) {
                    context.drawImage(imgElement, imgObj.x, imgObj.y, imgObj.width, imgObj.height);
                    resolve();
                } else {
                    const img = new Image();
                    img.onload = () => { imageRefs.current.set(imgObj.id, img); context.drawImage(img, imgObj.x, imgObj.y, imgObj.width, imgObj.height); resolve(); };
                    img.onerror = () => resolve();
                    img.src = imgObj.src;
                }
            });
        });
        await Promise.all(imagePromises);

        requestAnimationFrame(drawScene);
    };
    renderOffscreen();
  }, [drawingObjects, images, numPages, subject, totalHeight, customFonts, fontImageCache, drawScene]);

  useEffect(() => {
    const setupCanvases = () => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const rect = viewport.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        const setupCanvas = (canvas: HTMLCanvasElement, contextRef: React.MutableRefObject<CanvasRenderingContext2D | null>) => {
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) return;
            contextRef.current = context;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;
            context.scale(dpr, dpr);
        };

        if (contentCanvasRef.current) setupCanvas(contentCanvasRef.current, contentContextRef);
        if (uiCanvasRef.current) setupCanvas(uiCanvasRef.current, uiContextRef);
        if (!offscreenContextRef.current) {
            offscreenContextRef.current = offscreenCanvasRef.current.getContext('2d', { willReadFrequently: true });
        }
        
        setTransform(t => ({...t, offsetX: rect.width / 2 - (PAGE_WIDTH * t.scale) / 2}));
        requestAnimationFrame(drawScene);
    };
    setupCanvases();
    window.addEventListener('resize', setupCanvases);
    return () => window.removeEventListener('resize', setupCanvases);
  }, [drawScene, subject.id]);
  
  useEffect(() => {
    setToolSettings(prev => ({
      ...prev, color: theme === 'light' ? (prev.color === '#FFFFFF' ? '#000000' : prev.color) : (prev.color === '#000000' ? '#FFFFFF' : prev.color)
    }));
  }, [theme]);
  
  const handleTextCancel = useCallback(() => setEditingText(null), []);
  
  const pushHistory = useCallback((newObjects: DrawingObject[]) => {
    setHistory(prevHistory => {
      const { historyIndex } = notebookStateRef.current;
      const newHistory = prevHistory.slice(0, historyIndex + 1);
      newHistory.push(newObjects);
      setHistoryIndex(newHistory.length - 1);
      return newHistory;
    });
  }, []);
  
  const handleTextSubmit = useCallback((text: string) => {
      const { editingText, toolSettings, drawingObjects } = notebookStateRef.current;
      setEditingText(null);
      if (!text.trim() || !editingText) return;
      const newTextObject: TextObject = {
        id: new Date().toISOString(), tool: ToolType.Text, text, x: editingText.x, y: editingText.y,
        fontSize: editingText.fontSize, fontFamily: toolSettings.fontFamily, color: toolSettings.color,
      };
      const newObjects = [...drawingObjects, newTextObject];
      setDrawingObjects(newObjects);
      pushHistory(newObjects);
  }, [pushHistory]);
  
  useEffect(() => {
    if (!notebookStateRef.current.editingText && nextTextOpenerRef.current) {
        const { x, y } = nextTextOpenerRef.current;
        const { toolSettings, subject, getLineHeight } = notebookStateRef.current;
        
        const worldPos = canvasToWorld(x, y);
        const { x: snappedX, y: snappedY } = getSnappedPosition(worldPos.x, worldPos.y);
        const isSnapped = snappedX === TEXT_SNAP_MARGIN;
        const lineHeight = getLineHeight(subject);
        const fontSize = (isSnapped && lineHeight > 1) ? lineHeight * 0.8 : toolSettings.size * 2.5;

        if (toolSettings.tool === ToolType.Text) {
          setEditingText({ x: snappedX, y: snappedY, fontSize });
        }
        
        nextTextOpenerRef.current = null;
    }
  }, [editingText]);

  const performUndo = useCallback(() => {
    setHistoryIndex(prev => {
      if (prev > 0) { const newIndex = prev - 1; setDrawingObjects(notebookStateRef.current.history[newIndex] || []); return newIndex; }
      return prev;
    });
  }, []);
  const performRedo = useCallback(() => {
    setHistoryIndex(prev => {
      if (prev < notebookStateRef.current.history.length - 1) { const newIndex = prev + 1; setDrawingObjects(notebookStateRef.current.history[newIndex] || []); return newIndex; }
      return prev;
    });
  }, []);
  
  const handleUndoPress = useCallback(() => {
    performUndo();
    undoTimeoutRef.current = window.setTimeout(() => {
      undoIntervalRef.current = window.setInterval(performUndo, 150);
      undoSpeedTimeoutRef.current = window.setTimeout(() => {
        if(undoIntervalRef.current) clearInterval(undoIntervalRef.current);
        undoIntervalRef.current = window.setInterval(performUndo, 50);
      }, 1000);
    }, 400);
  }, [performUndo]);
  const handleUndoRelease = useCallback(() => {
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);
    if (undoSpeedTimeoutRef.current) clearTimeout(undoSpeedTimeoutRef.current);
  }, []);
  const handleRedoPress = useCallback(() => {
    performRedo();
    redoTimeoutRef.current = window.setTimeout(() => {
      redoIntervalRef.current = window.setInterval(performRedo, 150);
      redoSpeedTimeoutRef.current = window.setTimeout(() => {
        if(redoIntervalRef.current) clearInterval(redoIntervalRef.current);
        redoIntervalRef.current = window.setInterval(performRedo, 50);
      }, 1000);
    }, 400);
  }, [performRedo]);
  const handleRedoRelease = useCallback(() => {
    if (redoTimeoutRef.current) clearTimeout(redoTimeoutRef.current);
    if (redoIntervalRef.current) clearInterval(redoIntervalRef.current);
    if (redoSpeedTimeoutRef.current) clearTimeout(redoSpeedTimeoutRef.current);
  }, []);
  
  const canvasToWorld = useCallback((x: number, y: number): {x: number, y: number} => ({
    x: (x - notebookStateRef.current.transform.offsetX) / notebookStateRef.current.transform.scale, 
    y: (y - notebookStateRef.current.transform.offsetY) / notebookStateRef.current.transform.scale,
  }), []);

  const getSnappedPosition = useCallback((posX: number, posY: number) => {
      let finalX = posX; let finalY = posY;
      const { subject, transform, getLineHeight } = notebookStateRef.current;
      const lineHeight = getLineHeight(subject);
      if (lineHeight > 1) {
          const pageIndex = Math.floor(posY / (PAGE_HEIGHT + PAGE_GAP));
          const pageTop = pageIndex * (PAGE_HEIGHT + PAGE_GAP);
          const yOnPage = posY - pageTop;
          const nearestLineIndex = Math.round(yOnPage / lineHeight);
          const nearestLineY = nearestLineIndex * lineHeight;
          if (Math.abs(yOnPage - nearestLineY) < TEXT_SNAP_THRESHOLD / transform.scale) {
              finalY = pageTop + nearestLineY;
              finalX = TEXT_SNAP_MARGIN;
          }
      }
      return { x: finalX, y: finalY };
  }, []);
  
  const clampTransform = useCallback((t: TransformState): TransformState => {
    const { totalHeight } = notebookStateRef.current;
    const viewportHeight = viewportRef.current?.clientHeight ?? window.innerHeight;
    const contentHeight = totalHeight * t.scale;
    const newOffsetY = contentHeight <= viewportHeight ? 0 : Math.max(-(contentHeight - viewportHeight), Math.min(0, t.offsetY));
    return { ...t, offsetY: newOffsetY };
  }, []);

  const stopInertialScroll = useCallback(() => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
      scrollVelocityY.current = 0;
  }, []);
  const startInertialScroll = useCallback(() => {
    const scrollLoop = () => {
        if (Math.abs(scrollVelocityY.current) < 0.1) { stopInertialScroll(); return; }
        setTransform(t => clampTransform({ ...t, offsetY: t.offsetY + scrollVelocityY.current }));
        scrollVelocityY.current *= SCROLL_DAMPING;
        animationFrameId.current = requestAnimationFrame(scrollLoop);
    };
    if(animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    animationFrameId.current = requestAnimationFrame(scrollLoop);
  }, [clampTransform, stopInertialScroll]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const { toolSettings, editingText, images, subject, getLineHeight } = notebookStateRef.current;
    if (editingText) {
        if (toolSettings.tool === ToolType.Text) {
            nextTextOpenerRef.current = { x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY };
            textareaRef.current?.blur();
        }
        return;
    }
    stopInertialScroll();
    pointersRef.current.set(event.pointerId, event);
    const pointerCount = pointersRef.current.size;
    const worldPos = canvasToWorld(event.nativeEvent.offsetX, event.nativeEvent.offsetY);
    if (event.pointerType === 'touch' && pointerCount === 1 && toolSettings.tool !== ToolType.Text) {
      let didHitImage = false;
      for (let i = images.length - 1; i >= 0; i--) {
          const img = images[i];
          if (worldPos.x >= img.x && worldPos.x <= img.x + img.width && worldPos.y >= img.y && worldPos.y <= img.y + img.height) {
              pointerInteractionRef.current = { isMovingImage: true, selectedImageId: img.id, pointerOffset: { x: worldPos.x - img.x, y: worldPos.y - img.y }};
              didHitImage = true; break;
          }
      }
      if (didHitImage) setImages(imgs => [...imgs]);
      else {
        pointerInteractionRef.current = { isMovingImage: false, selectedImageId: null, pointerOffset: { x: 0, y: 0 }};
        isPanningRef.current = true;
        lastPanPoint.current = { x: event.clientX, y: event.clientY };
        scrollVelocityY.current = 0;
      }
    } else if (event.pointerType !== 'touch' || toolSettings.tool === ToolType.Text) {
        if (pointerCount === 1) {
            if (toolSettings.tool === ToolType.Text) {
                const { x, y } = getSnappedPosition(worldPos.x, worldPos.y);
                const isSnapped = x === TEXT_SNAP_MARGIN;
                const lineHeight = getLineHeight(subject);
                const fontSize = (isSnapped && lineHeight > 1) ? lineHeight * 0.8 : toolSettings.size * 2.5;
                setEditingText({ x, y, fontSize });
            } else {
                setIsDrawing(true);
                const size = getStrokeWidth(toolSettings.tool, toolSettings.size);
                let newPath: Path;
                switch (toolSettings.tool) {
                    case ToolType.Pen:
                    case ToolType.Pencil: newPath = { id: new Date().toISOString(), tool: toolSettings.tool, color: toolSettings.color, size, points: [worldPos], globalCompositeOperation: 'source-over', globalAlpha: toolSettings.tool === ToolType.Pen ? 1 : 0.7 }; break;
                    case ToolType.Highlighter: newPath = { id: new Date().toISOString(), tool: toolSettings.tool, color: toolSettings.color, size, points: [worldPos], globalCompositeOperation: 'source-over', globalAlpha: 0.2 }; break;
                    case ToolType.Eraser: newPath = { id: new Date().toISOString(), tool: toolSettings.tool, color: '#000', size, points: [worldPos], globalCompositeOperation: 'destination-out', globalAlpha: 1 }; break;
                    default: return;
                }
                currentPathRef.current = newPath;
            }
        }
    } else {
      isPanningRef.current = false;
      if (pointerCount >= 2) {
        const positions = new Map();
        pointersRef.current.forEach(p => positions.set(p.pointerId, { x: p.clientX, y: p.clientY }));
        if(pointerCount <=3) lastTapInfoRef.current = { time: Date.now(), pointerCount, positions };
        const [p1, p2] = Array.from(pointersRef.current.values());
        const distance = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
        const center = { x: (p1.clientX + p2.clientX) / 2, y: (p1.clientY + p2.clientY) / 2 };
        prevGestureRef.current = { distance, center };
      }
    }
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, event);
    const { transform } = notebookStateRef.current;
    
    const events = (event.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [event.nativeEvent];

    if ((event.pointerType === 'pen' || event.pointerType === 'mouse') && notebookStateRef.current.isDrawing) {
        const context = uiContextRef.current;
        if (!context || !currentPathRef.current) return;
        
        for (const coalescedEvent of events) {
          const worldPos = canvasToWorld(coalescedEvent.offsetX, coalescedEvent.offsetY);
          currentPathRef.current.points.push(worldPos);
        }

        context.clearRect(0,0, context.canvas.width, context.canvas.height);
        context.save();
        context.translate(transform.offsetX, transform.offsetY);
        context.scale(transform.scale, transform.scale);
        drawSmoothPath(context, currentPathRef.current);
        context.restore();
        return;
    }
    if (event.pointerType === 'touch') {
      event.preventDefault();
      const { isMovingImage, selectedImageId, pointerOffset } = pointerInteractionRef.current;
      if (isMovingImage && selectedImageId) {
        const worldPos = canvasToWorld(event.nativeEvent.offsetX, event.nativeEvent.offsetY);
        setImages(imgs => imgs.map(img => img.id === selectedImageId ? { ...img, x: worldPos.x - pointerOffset.x, y: worldPos.y - pointerOffset.y } : img));
        return;
      }
      if (lastTapInfoRef.current) {
        let totalMove = 0;
        lastTapInfoRef.current.positions.forEach((startPos, id) => {
          const current = pointersRef.current.get(id);
          if (current) totalMove += Math.hypot(current.clientX - startPos.x, current.clientY - startPos.y);
        });
        if (totalMove > lastTapInfoRef.current.pointerCount * TAP_MOVE_THRESHOLD) lastTapInfoRef.current = null;
      }
      if (isPanningRef.current && pointersRef.current.size === 1) {
        const deltaY = event.clientY - lastPanPoint.current.y;
        const deltaX = event.clientX - lastPanPoint.current.x;
        setTransform(t => clampTransform({ ...t, offsetY: t.offsetY + deltaY, offsetX: t.offsetX + deltaX }));
        scrollVelocityY.current = deltaY;
        lastPanPoint.current = { x: event.clientX, y: event.clientY };
      } else if (pointersRef.current.size >= 2) {
        const [p1, p2] = Array.from(pointersRef.current.values());
        const newDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
        const newCenter = { x: (p1.clientX + p2.clientX) / 2, y: (p1.clientY + p2.clientY) / 2 };
        if (prevGestureRef.current) {
          const { distance } = prevGestureRef.current;
          const scaleDelta = newDist / distance;
          let newScale = transform.scale * scaleDelta;
          if (newScale < 1 && newScale > QUICK_ZOOM_RESET_THRESHOLD) newScale = 1 + (newScale - 1) * 0.2;
          const worldFocusX = (newCenter.x - transform.offsetX) / transform.scale;
          const worldFocusY = (newCenter.y - transform.offsetY) / transform.scale;
          const newOffsetX = newCenter.x - worldFocusX * newScale;
          const newOffsetY = newCenter.y - worldFocusY * newScale;
          setTransform(clampTransform({ scale: Math.max(0.1, Math.min(5, newScale)), offsetX: newOffsetX, offsetY: newOffsetY }));
        }
        prevGestureRef.current = { distance: newDist, center: newCenter };
      }
    }
  }, []);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const pointer = pointersRef.current.get(event.pointerId); if (!pointer) return;
    const { toolSettings, transform, drawingObjects } = notebookStateRef.current;
    
    pointerInteractionRef.current = { isMovingImage: false, selectedImageId: null, pointerOffset: { x: 0, y: 0 }};
    if (pointer.pointerType === 'touch' && lastTapInfoRef.current) {
        const { time, pointerCount } = lastTapInfoRef.current;
        if (Date.now() - time < TAP_TIMEOUT) {
            if (pointerCount === 2) performUndo(); if (pointerCount === 3) performRedo();
            pointersRef.current.clear(); lastTapInfoRef.current = null; prevGestureRef.current = null; isPanningRef.current = false; return;
        }
    }
    if (isPanningRef.current && pointer.pointerType === 'touch') startInertialScroll();
    pointersRef.current.delete(event.pointerId);
    
    if ((pointer.pointerType === 'pen' || pointer.pointerType === 'mouse') && toolSettings.tool !== ToolType.Text) {
        setIsDrawing(false);
        uiContextRef.current?.clearRect(0, 0, uiCanvasRef.current!.width, uiCanvasRef.current!.height);
        if (currentPathRef.current && currentPathRef.current.points.length > 0) {
          const newObjects = [...drawingObjects, currentPathRef.current];
          setDrawingObjects(newObjects);
          pushHistory(newObjects);
        }
        currentPathRef.current = null;
    }

    if (pointersRef.current.size < 2) {
      if (transform.scale < QUICK_ZOOM_RESET_THRESHOLD) setTransform({ scale: 1, offsetX: (viewportRef.current?.clientWidth ?? window.innerWidth)/2 - PAGE_WIDTH/2, offsetY: 0 });
      else if (transform.scale < 1) setTransform(t => ({ ...t, scale: 1 }));
    }
    if (pointersRef.current.size < 1) isPanningRef.current = false;
    else if (pointersRef.current.size === 1) {
        isPanningRef.current = true;
        const remainingPointer = Array.from(pointersRef.current.values())[0];
        lastPanPoint.current = { x: remainingPointer.clientX, y: remainingPointer.clientY };
        scrollVelocityY.current = 0;
    }
    if (pointersRef.current.size < 2) prevGestureRef.current = null;
    lastTapInfoRef.current = null;
  }, []);

  const addPage = useCallback(() => setNumPages(p => { const n = p + 1; onPageCountChange(subject.id, n); return n; }), [onPageCountChange, subject.id]);
  const handleAddFile = useCallback((source: 'gallery' | 'camera' | 'files') => {
    if (source === 'gallery') galleryInputRef.current?.click();
    else if (source === 'camera') cameraInputRef.current?.click();
    else if (source === 'files') filesInputRef.current?.click();
  }, []);
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0 || !viewportRef.current) return;
      const { transform } = notebookStateRef.current;
      const { height } = viewportRef.current.getBoundingClientRect();
      const insertY = ((-transform.offsetY + height / 2) / transform.scale) - 150;
      Array.from(files).filter(f => f.type.startsWith('image/')).forEach(file => {
          const reader = new FileReader();
          reader.onload = e => {
              if (typeof e.target?.result !== 'string') return;
              const img = new Image();
              img.onload = () => {
                  const scale = Math.min(1, (PAGE_WIDTH - 40) / img.width);
                  setImages(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, src: img.src, x: 20, y: insertY, width: img.width * scale, height: img.height * scale }]);
              };
              img.src = e.target.result;
          };
          reader.readAsDataURL(file);
      });
      event.target.value = '';
  }, []);
  
  useEffect(() => {
    const ctx = uiContextRef.current; if (!ctx) return;
    const { transform } = notebookStateRef.current;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const id = pointerInteractionRef.current.selectedImageId;
    if (id) {
        const img = images.find(i => i.id === id);
        if (img) {
            ctx.save();
            ctx.translate(transform.offsetX, transform.offsetY); ctx.scale(transform.scale, transform.scale);
            ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 4 / transform.scale; ctx.globalAlpha = 0.8;
            ctx.strokeRect(img.x - 2, img.y - 2, img.width + 4, img.height + 4);
            ctx.restore();
        }
    }
  }, [images, transform]);

  const renderFullCanvas = useCallback(async (): Promise<HTMLCanvasElement | null> => {
    const { subject, drawingObjects, images, customFonts, fontImageCache, numPages, totalHeight } = notebookStateRef.current;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = PAGE_WIDTH; tempCanvas.height = totalHeight;
    const ctx = tempCanvas.getContext('2d'); if (!ctx) return null;
    for(let i = 0; i < numPages; i++) drawPageBackground(ctx, subject, i, totalHeight);
    drawingObjects.forEach(obj => {
        if (obj.tool === ToolType.Text) drawTextOnCanvas(ctx, obj as TextObject, customFonts, fontImageCache);
        else drawSmoothPath(ctx, obj as Path);
    });
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    await Promise.all(images.map(imgObj => new Promise<void>(resolve => {
        const img = new Image();
        img.onload = () => { ctx.drawImage(img, imgObj.x, imgObj.y, imgObj.width, imgObj.height); resolve(); };
        img.onerror = () => resolve(); img.src = imgObj.src;
    })));
    return tempCanvas;
  }, []);

  useImperativeHandle(ref, () => ({ renderFullCanvas }));

  const handlePrint = useCallback(async (pageSelection: string) => {
    setIsPreparingPrint(true);
    setTimeout(async () => {
        const { numPages } = notebookStateRef.current;
        const fullCanvas = await renderFullCanvas();
        if (!fullCanvas) { alert("Failed to prepare pages."); setIsPreparingPrint(false); return; }
        const pagesToPrint = [];
        try {
            pageSelection.split(',').forEach(p => p.includes('-') ? (() => {const [s,e]=p.split('-').map(Number);for(let i=s;i<=e;i++)pagesToPrint.push(i)})() : pagesToPrint.push(Number(p)))
        } catch (e) { alert("Invalid page format."); setIsPreparingPrint(false); return; }
        const uniquePages = [...new Set(pagesToPrint)].map(p=>p-1).filter(p=>p>=0 && p<numPages).sort((a,b)=>a-b);
        const container = document.getElementById('print-container');
        if (container) {
            container.innerHTML = '';
            uniquePages.forEach(i => {
                const pageCanvas=document.createElement('canvas'); pageCanvas.width=PAGE_WIDTH; pageCanvas.height=PAGE_HEIGHT;
                pageCanvas.getContext('2d')?.drawImage(fullCanvas, 0, i * (PAGE_HEIGHT + PAGE_GAP), PAGE_WIDTH, PAGE_HEIGHT, 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
                const img = document.createElement('img'); img.src = pageCanvas.toDataURL('image/png'); img.className='print-page'; container.appendChild(img);
            });
            setShowPrintModal(false); setIsPreparingPrint(false);
            setTimeout(() => window.print(), 500);
        } else { setIsPreparingPrint(false); }
    }, 10);
  }, [renderFullCanvas]);

  const notebookBgClass = theme === 'light' ? 'bg-zinc-900' : 'bg-black';
  const canUndo = !editingText && historyIndex > 0;
  const canRedo = !editingText && historyIndex < history.length - 1;

  const CanvasTextEditor: React.FC<{ worldX: number; worldY: number; onSubmit: (text: string) => void; onCancel: () => void; settings: ToolSettings; fontSize: number; }> = ({ worldX, worldY, onSubmit, onCancel, settings, fontSize }) => {
    const { transform } = notebookStateRef.current;
    const lineHeight = fontSize * 1.2;
    const screenX = (worldX * transform.scale) + transform.offsetX;
    const screenY = (worldY * transform.scale) + transform.offsetY;
    useEffect(() => { textareaRef.current?.focus(); }, []);
    const handleSubmit = useCallback(() => onSubmit(textareaRef.current?.value || ''), [onSubmit]);
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    };
    return ( <textarea ref={textareaRef} onBlur={handleSubmit} onKeyDown={handleKeyDown} style={{ position: 'absolute', top: `${screenY - lineHeight}px`, left: `${screenX}px`, transform: `scale(${transform.scale})`, transformOrigin: 'top left', font: `${fontSize}px ${settings.fontFamily}`, color: settings.color, background: 'transparent', border: 'none', outline: 'none', resize: 'none', overflow: 'hidden', width: `${PAGE_WIDTH}px`, lineHeight: `${lineHeight / fontSize}`, whiteSpace: 'pre-wrap', zIndex: 100, }} autoCapitalize="sentences" /> );
  };

  return (
    <div className="flex-1 flex flex-col bg-black overflow-hidden">
      <SizeSlider size={toolSettings.size} onSizeChange={(newSize) => setToolSettings(prev => ({...prev, size: newSize}))} />
      <div className="sticky top-0 z-20 bg-black shadow-lg shadow-black/30">
        <header className="p-4 text-center"><h2 className="text-xl font-semibold text-slate-300">{subject.name}</h2></header>
        <Toolbar
          settings={toolSettings}
          onSettingsChange={setToolSettings}
          onAddPage={addPage}
          onAddFile={handleAddFile}
          theme={theme}
          onThemeChange={onThemeChange}
          onPrint={() => setShowPrintModal(true)}
          onUndoPress={handleUndoPress}
          onUndoRelease={handleUndoRelease}
          onRedoPress={handleRedoPress}
          onRedoRelease={handleRedoRelease}
          canUndo={canUndo}
          canRedo={canRedo}
          onOpenPageStyleSettings={onOpenPageStyleSettings}
          customFonts={customFonts}
          onOpenCreateFont={onOpenCreateFont}
          isRulerVisible={isRulerVisible}
          onToggleRuler={onToggleRuler}
        />
      </div>
      <div ref={viewportRef} className={`flex-1 overflow-hidden ${notebookBgClass} p-0 transition-colors relative cursor-crosshair`}>
          <canvas ref={contentCanvasRef} className="absolute top-0 left-0" />
          <canvas ref={uiCanvasRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onPointerLeave={handlePointerUp} className="absolute top-0 left-0" style={{ touchAction: 'none' }} />
           {editingText && <CanvasTextEditor worldX={editingText.x} worldY={editingText.y} onSubmit={handleTextSubmit} onCancel={handleTextCancel} settings={toolSettings} fontSize={editingText.fontSize} />}
      </div>
      {showPrintModal && <PrintModal totalPages={numPages} onClose={() => setShowPrintModal(false)} onPrint={handlePrint} isPreparing={isPreparingPrint} />}
      <input type="file" ref={galleryInputRef} onChange={handleFileSelect} accept="image/*" multiple style={{ display: 'none' }} />
      <input type="file" ref={cameraInputRef} onChange={handleFileSelect} accept="image/*" capture="environment" style={{ display: 'none' }} />
      <input type="file" ref={filesInputRef} onChange={handleFileSelect} accept="image/*" multiple style={{ display: 'none' }} />
    </div>
  );
});
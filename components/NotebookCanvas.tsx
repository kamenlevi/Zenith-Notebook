import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  forwardRef,
} from 'react';
import { NotebookEngine, type SelectionInfo, type TextEditRequest } from '../engine/NotebookEngine';
import type { AppSettings, CustomFont, Notebook, NoteObject, ToolSettings } from '../types';
import { cssFont } from '../lib/text';
import { getGlyphAtlas } from '../lib/customFont';
import {
  AddPageIcon,
  BringForwardIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentDuplicateIcon,
  FitWidthIcon,
  PencilSquareIcon,
  SendBackwardIcon,
  TrashIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from './Icons';

export interface NotebookCanvasHandle {
  engine: NotebookEngine | null;
}

interface Props {
  notebook: Notebook;
  toolSettings: ToolSettings;
  appSettings: AppSettings;
  customFonts: CustomFont[];
  onDocumentChange: (objects: NoteObject[]) => void;
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
  onAddPage: () => void;
  onError: (message: string) => void;
}

export const NotebookCanvas = forwardRef<NotebookCanvasHandle, Props>(
  (
    {
      notebook,
      toolSettings,
      appSettings,
      customFonts,
      onDocumentChange,
      onHistoryChange,
      onAddPage,
      onError,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const baseRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<NotebookEngine | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const [selection, setSelection] = useState<SelectionInfo>({
      ids: [],
      screen: null,
      singleTextId: null,
    });
    const [textEdit, setTextEdit] = useState<TextEditRequest | null>(null);
    const [textValue, setTextValue] = useState('');
    const [zoom, setZoom] = useState(1);
    const [pageIndex, setPageIndex] = useState(0);
    const editorBarRef = useRef<HTMLDivElement>(null);
    const commitRef = useRef<() => void>(() => {});

    // Engine is created once and kept for the component's lifetime; the
    // notebook it renders is swapped in via setNotebook.
    if (engineRef.current === null) {
      engineRef.current = new NotebookEngine(toolSettings, appSettings);
    }
    const engine = engineRef.current;

    useImperativeHandle(ref, () => ({ engine }), [engine]);

    /* --------------------------------------------------------------- */
    /* Wiring                                                          */
    /* --------------------------------------------------------------- */

    useEffect(() => {
      engine.setCallbacks({
        onDocumentChange,
        onHistoryChange,
        onSelectionChange: setSelection,
        onViewportChange: ({ scale, pageIndex: page }) => {
          setZoom(scale);
          setPageIndex(page);
        },
        onTextEdit: (request) => {
          setTextEdit(request);
          setTextValue(request?.text ?? '');
        },
        onCommitPendingText: () => commitRef.current(),
        onError,
      });
    }, [engine, onDocumentChange, onHistoryChange, onError]);

    useEffect(() => {
      const container = containerRef.current;
      const base = baseRef.current;
      const overlay = overlayRef.current;
      if (!container || !base || !overlay) return;
      engine.attach(base, overlay, container);
      return () => engine.destroy();
    }, [engine]);

    useEffect(() => {
      engine.setNotebook(notebook, false);
      // Re-fit only when the page geometry itself changes, not on every edit.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [engine, notebook.id, notebook.pageFormat, notebook.pageCount, notebook.theme, notebook.pageBackground, notebook.lineSpacingCm, notebook.lineColor]);

    useEffect(() => engine.setToolSettings(toolSettings), [engine, toolSettings]);
    useEffect(() => engine.setAppSettings(appSettings), [engine, appSettings]);

    useEffect(() => {
      engine.setCustomFonts(customFonts);
      // Rasterise every custom font used anywhere in the document, not just
      // the one currently selected in the toolbar.
      const used = new Set(
        notebook.objects.filter((o) => o.kind === 'text').map((o) => (o as { fontFamily: string }).fontFamily),
      );
      used.add(toolSettings.fontFamily);
      const pending = customFonts.filter((f) => used.has(f.id));
      if (pending.length === 0) return;
      let cancelled = false;
      void Promise.all(pending.map((font) => getGlyphAtlas(font))).then(() => {
        if (!cancelled) engine.refreshTextBounds();
      });
      return () => {
        cancelled = true;
      };
    }, [engine, customFonts, notebook.objects, toolSettings.fontFamily]);

    /* --------------------------------------------------------------- */
    /* Keyboard                                                        */
    /* --------------------------------------------------------------- */

    useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
        const target = event.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable)
        ) {
          return;
        }
        engine.handleKeyDown(event);
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [engine]);

    /* --------------------------------------------------------------- */
    /* Text editing overlay                                            */
    /* --------------------------------------------------------------- */

    /**
     * Keep the editing overlay glued to its spot on the page.
     *
     * Position is driven from the engine's live viewport every frame rather
     * than from React state, because panning does not change any state the
     * component renders from — so a state-driven overlay drifts away from the
     * page the moment you scroll while typing.
     */
    useEffect(() => {
      if (!textEdit) return;
      let handle = 0;
      const apply = () => {
        const textarea = textareaRef.current;
        if (textarea) {
          const rect = engine.textEditScreenRect(textEdit);
          textarea.style.left = `${rect.left}px`;
          textarea.style.top = `${rect.top}px`;
          textarea.style.width = `${rect.width}px`;
          textarea.style.font = cssFont(rect.fontSize, textEdit.fontFamily);
          textarea.style.lineHeight = `${rect.lineHeight}px`;
          textarea.style.color = textEdit.color;
          // Grow with the content so nothing hides behind a scrollbar.
          textarea.style.height = 'auto';
          const wanted = Math.max(rect.lineHeight, textarea.scrollHeight);
          textarea.style.height = `${wanted}px`;

          const bar = editorBarRef.current;
          if (bar) {
            bar.style.left = `${rect.left}px`;
            bar.style.top = `${Math.max(4, rect.top - 46)}px`;
          }
        }
        handle = requestAnimationFrame(apply);
      };
      handle = requestAnimationFrame(apply);
      return () => cancelAnimationFrame(handle);
    }, [textEdit, engine, textValue]);

    useLayoutEffect(() => {
      const textarea = textareaRef.current;
      if (!textarea || !textEdit) return;
      textarea.focus({ preventScroll: true });
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    }, [textEdit]);

    const commitText = useCallback(() => {
      if (!textEdit) return;
      engine.commitTextEdit(textEdit, textValue);
    }, [engine, textEdit, textValue]);

    commitRef.current = commitText;

    const cancelText = useCallback(() => {
      engine.cancelTextEdit();
    }, [engine]);

    const handleTextKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelText();
        return;
      }
      // Enter inserts a newline — this is a paragraph box, not a one-line
      // prompt. Cmd/Ctrl+Enter commits, matching every other editor.
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        commitText();
      }
    };

    const isCustomEditorFont = customFonts.some((f) => f.id === textEdit?.fontFamily);

    /* --------------------------------------------------------------- */
    /* Selection toolbar                                               */
    /* --------------------------------------------------------------- */

    const selectionToolbar = (() => {
      if (!selection.screen || selection.ids.length === 0 || textEdit) return null;
      const { x, y, width } = selection.screen;
      const container = containerRef.current;
      const maxWidth = container?.clientWidth ?? window.innerWidth;
      const left = Math.min(Math.max(12, x + width / 2), maxWidth - 12);
      const top = Math.max(8, y - 52);
      return (
        <div
          className="absolute z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-slate-700 bg-slate-900/95 p-1 shadow-2xl backdrop-blur"
          style={{ left, top }}
        >
          {selection.singleTextId && (
            <SelectionButton label="Edit text" onClick={() => engine.editSelectedText()}>
              <PencilSquareIcon className="h-4 w-4" />
            </SelectionButton>
          )}
          <SelectionButton label="Duplicate" onClick={() => engine.duplicateSelection()}>
            <DocumentDuplicateIcon className="h-4 w-4" />
          </SelectionButton>
          <SelectionButton label="Bring to front" onClick={() => engine.reorderSelection('front')}>
            <BringForwardIcon className="h-4 w-4" />
          </SelectionButton>
          <SelectionButton label="Send to back" onClick={() => engine.reorderSelection('back')}>
            <SendBackwardIcon className="h-4 w-4" />
          </SelectionButton>
          <div className="mx-0.5 h-5 w-px bg-slate-700" />
          <SelectionButton label="Delete" destructive onClick={() => engine.deleteSelection()}>
            <TrashIcon className="h-4 w-4" />
          </SelectionButton>
        </div>
      );
    })();

    /* --------------------------------------------------------------- */

    const canGoPrev = pageIndex > 0;
    const canGoNext = pageIndex < notebook.pageCount - 1;

    return (
      <div ref={containerRef} className="relative flex-1 overflow-hidden select-none">
        <canvas ref={baseRef} className="absolute inset-0" />
        <canvas
          ref={overlayRef}
          className="absolute inset-0 touch-none"
          style={{ touchAction: 'none' }}
        />

        {textEdit && (
          <>
            <textarea
              ref={textareaRef}
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={handleTextKeyDown}
              spellCheck={false}
              autoCapitalize="sentences"
              autoCorrect="off"
              className="absolute z-40 resize-none overflow-hidden border-none bg-transparent p-0 outline-none"
              style={{
                // A faint outline keeps the box findable on white paper
                // without shifting where the glyphs land.
                boxShadow: '0 0 0 1px rgba(56,189,248,0.6), 0 0 0 6px rgba(56,189,248,0.12)',
                borderRadius: '2px',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'break-word',
                caretColor: textEdit.color,
              }}
              placeholder="Type…"
            />
            <div
              ref={editorBarRef}
              className="absolute z-40 flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/95 p-1 shadow-xl backdrop-blur"
            >
              {isCustomEditorFont && (
                <span className="px-2 text-[11px] text-slate-400">
                  Preview shown in Lora; your handwriting is applied on the page
                </span>
              )}
              <SelectionButton label="Done (⌘↵)" onClick={commitText}>
                <CheckIcon className="h-4 w-4" />
              </SelectionButton>
              <SelectionButton label="Cancel (Esc)" onClick={cancelText}>
                <XIcon className="h-4 w-4" />
              </SelectionButton>
            </div>
          </>
        )}

        {selectionToolbar}

        {/* Page and zoom controls */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-slate-700/80 bg-slate-900/90 p-1 shadow-2xl backdrop-blur">
            <IconButton
              label="Previous page"
              disabled={!canGoPrev}
              onClick={() => engine.scrollToPage(pageIndex - 1)}
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </IconButton>
            <span className="min-w-[74px] px-1 text-center text-xs tabular-nums text-slate-300">
              {pageIndex + 1} / {notebook.pageCount}
            </span>
            <IconButton
              label="Next page"
              disabled={!canGoNext}
              onClick={() => engine.scrollToPage(pageIndex + 1)}
            >
              <ChevronRightIcon className="h-4 w-4" />
            </IconButton>

            <div className="mx-1 h-5 w-px bg-slate-700" />

            <IconButton label="Add page" onClick={onAddPage}>
              <AddPageIcon className="h-4 w-4" />
            </IconButton>

            <div className="mx-1 h-5 w-px bg-slate-700" />

            <IconButton label="Zoom out" onClick={() => engine.zoomBy(1 / 1.25)}>
              <ZoomOutIcon className="h-4 w-4" />
            </IconButton>
            <button
              onClick={() => engine.resetZoom()}
              className="min-w-[52px] rounded-lg px-2 py-1.5 text-xs tabular-nums text-slate-300 transition-colors hover:bg-slate-800"
              title="Reset to 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <IconButton label="Zoom in" onClick={() => engine.zoomBy(1.25)}>
              <ZoomInIcon className="h-4 w-4" />
            </IconButton>
            <IconButton label="Fit page width" onClick={() => engine.fitWidth()}>
              <FitWidthIcon className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
      </div>
    );
  },
);

NotebookCanvas.displayName = 'NotebookCanvas';

const SelectionButton: React.FC<{
  label: string;
  onClick: () => void;
  destructive?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, destructive, children }) => (
  <button
    onClick={onClick}
    title={label}
    aria-label={label}
    className={`rounded-lg p-2 transition-colors ${
      destructive
        ? 'text-red-400 hover:bg-red-500/20'
        : 'text-slate-300 hover:bg-slate-700 hover:text-white'
    }`}
  >
    {children}
  </button>
);

const IconButton: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, disabled, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={label}
    aria-label={label}
    className="rounded-lg p-2 text-slate-300 transition-colors enabled:hover:bg-slate-700 enabled:hover:text-white disabled:opacity-35"
  >
    {children}
  </button>
);

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NotebookTabs } from './components/NotebookTabs';
import { Toolbar } from './components/Toolbar';
import { NotebookCanvas, type NotebookCanvasHandle } from './components/NotebookCanvas';
import { ActionsModal } from './components/ActionsModal';
import { EditPagesModal } from './components/EditPagesModal';
import { PageSettingsModal, type PageStyleUpdate } from './components/PageSettingsModal';
import { PrintModal } from './components/PrintModal';
import { SettingsModal } from './components/SettingsModal';
import { ShareExportModal } from './components/ShareExportModal';
import { CreateFontModal } from './components/CreateFontModal';
import { useToast } from './components/Toast';
import { SpinnerIcon } from './components/Icons';
import type { AppSettings, CustomFont, Notebook, NoteObject, ToolSettings } from './types';
import {
  DEFAULT_TOOL_SETTINGS,
  createNotebook,
  hydrateNotebook,
  migrateLegacySubject,
} from './lib/notebook';
import {
  clearAllData,
  collectGarbage,
  deleteNotebook as deleteNotebookRecord,
  hasMigrated,
  loadActiveNotebookId,
  loadAppSettings,
  loadCustomFonts,
  loadNotebooks,
  loadToolSettings,
  markMigrated,
  readLegacyFonts,
  readLegacySubjects,
  saveActiveNotebookId,
  saveAppSettings,
  saveCustomFonts,
  saveNotebook,
  saveToolSettings,
} from './lib/storage';
import {
  clearPrintContainer,
  importNotebookFile,
  printPages,
  readShareLink,
} from './lib/exporting';
import { uid } from './lib/id';

type ModalState =
  | { kind: 'none' }
  | { kind: 'actions'; id: string }
  | { kind: 'pages'; id: string }
  | { kind: 'pageStyle'; id: string }
  | { kind: 'share'; id: string }
  | { kind: 'print' }
  | { kind: 'settings' }
  | { kind: 'createFont'; editing: CustomFont | null };

const SAVE_DEBOUNCE_MS = 700;

/**
 * A shared notebook arrives in the URL hash. Read it once, at module scope,
 * before React mounts — reading it inside an effect means a double-invoked
 * effect (StrictMode, or any remount) can consume it twice or lose it to the
 * history replace performed by whichever run got there first.
 */
const PENDING_SHARE: string | null = (() => {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  if (!hash.startsWith('#nb=')) return null;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return hash;
})();

const App: React.FC = () => {
  const toast = useToast();

  const [ready, setReady] = useState(false);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [toolSettings, setToolSettings] = useState<ToolSettings>(DEFAULT_TOOL_SETTINGS);
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadAppSettings());
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [rulerVisible, setRulerVisible] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const canvasRef = useRef<NotebookCanvasHandle>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const dirtyNotebooks = useRef(new Map<string, Notebook>());

  const activeNotebook = useMemo(
    () => notebooks.find((n) => n.id === activeId) ?? null,
    [notebooks, activeId],
  );

  /* ---------------------------------------------------------------- */
  /* Boot                                                              */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        /*
         * Every read happens first, then a single cancellation gate, then
         * every write. Interleaving them meant a remount could run the
         * "no notebooks yet, create a starter" branch twice concurrently —
         * both runs saw an empty store and both wrote a starter. The user saw
         * one tab and found a phantom duplicate after reloading.
         */
        const storedFonts = loadCustomFonts();
        const migrated = hasMigrated();
        const legacyFonts = migrated ? null : readLegacyFonts();
        const legacySubjects = migrated ? null : readLegacySubjects();
        const stored = await loadNotebooks();
        const savedActive = loadActiveNotebookId();
        const storedTools = loadToolSettings(DEFAULT_TOOL_SETTINGS);

        if (cancelled) return;

        /* ---- writes from here on ---- */

        let fonts = storedFonts;
        if (legacyFonts && legacyFonts.length > 0 && storedFonts.length === 0) {
          fonts = legacyFonts;
          saveCustomFonts(legacyFonts);
        }

        const loaded = [...stored];

        if (legacySubjects && legacySubjects.length > 0) {
          for (const subject of legacySubjects) {
            const converted = await migrateLegacySubject(subject);
            await saveNotebook(converted);
            loaded.push(converted);
          }
          toast.success(
            `Brought ${legacySubjects.length} notebook${legacySubjects.length === 1 ? '' : 's'} over from the old version.`,
          );
        }
        if (!migrated) markMigrated();

        let shared: Notebook | null = null;
        if (PENDING_SHARE) {
          shared = readShareLink(PENDING_SHARE);
          if (shared) {
            const hydratedShare = hydrateNotebook(shared, fonts);
            await saveNotebook(hydratedShare);
            loaded.push(hydratedShare);
            shared = hydratedShare;
          } else {
            toast.error('That share link could not be read. It may have been truncated in transit.');
          }
        }

        if (loaded.length === 0) {
          const starter = createNotebook('My Notebook');
          await saveNotebook(starter);
          loaded.push(starter);
        }

        const hydrated = loaded.map((n) => hydrateNotebook(n, fonts));
        const initialId =
          shared?.id ??
          (savedActive && hydrated.some((n) => n.id === savedActive)
            ? savedActive
            : hydrated[0]?.id ?? null);

        setCustomFonts(fonts);
        setToolSettings(storedTools);
        setNotebooks(hydrated);
        setActiveId(initialId);
        if (shared) toast.success(`Imported "${shared.name}".`);
      } catch (err) {
        if (!cancelled) {
          toast.error(
            err instanceof Error
              ? err.message
              : 'Could not open local storage. Notebooks may not save.',
          );
          setNotebooks([createNotebook('My Notebook')]);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Boot runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------- */
  /* Persistence                                                       */
  /* ---------------------------------------------------------------- */

  const flushSaves = useCallback(() => {
    for (const [id, timer] of saveTimers.current) {
      clearTimeout(timer);
      saveTimers.current.delete(id);
    }
    const pending = [...dirtyNotebooks.current.values()];
    dirtyNotebooks.current.clear();
    for (const notebook of pending) {
      void saveNotebook(notebook).catch(() => {
        /* Reported on the next interactive save. */
      });
    }
  }, []);

  const scheduleSave = useCallback(
    (notebook: Notebook) => {
      if (!appSettings.autoSave) return;
      dirtyNotebooks.current.set(notebook.id, notebook);
      const existing = saveTimers.current.get(notebook.id);
      if (existing) clearTimeout(existing);
      saveTimers.current.set(
        notebook.id,
        setTimeout(() => {
          saveTimers.current.delete(notebook.id);
          const latest = dirtyNotebooks.current.get(notebook.id);
          dirtyNotebooks.current.delete(notebook.id);
          if (!latest) return;
          void saveNotebook(latest).catch((err) => {
            toast.error(err instanceof Error ? err.message : 'Could not save your notebook.');
          });
        }, SAVE_DEBOUNCE_MS),
      );
    },
    [appSettings.autoSave, toast],
  );

  // iPadOS reclaims background tabs aggressively, so flush on the way out.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushSaves();
    };
    window.addEventListener('pagehide', flushSaves);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flushSaves);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [flushSaves]);

  useEffect(() => saveAppSettings(appSettings), [appSettings]);
  useEffect(() => saveToolSettings(toolSettings), [toolSettings]);
  useEffect(() => saveCustomFonts(customFonts), [customFonts]);
  useEffect(() => saveActiveNotebookId(activeId), [activeId]);

  const updateNotebook = useCallback(
    (id: string, updates: Partial<Notebook>) => {
      setNotebooks((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;
          const next = { ...n, ...updates, updatedAt: Date.now() };
          scheduleSave(next);
          return next;
        }),
      );
    },
    [scheduleSave],
  );

  const handleDocumentChange = useCallback(
    (objects: NoteObject[]) => {
      if (!activeId) return;
      updateNotebook(activeId, { objects });
    },
    [activeId, updateNotebook],
  );

  const handleHistoryChange = useCallback((undoAvailable: boolean, redoAvailable: boolean) => {
    setCanUndo(undoAvailable);
    setCanRedo(redoAvailable);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Notebook management                                               */
  /* ---------------------------------------------------------------- */

  const createAndOpen = useCallback(
    (notebook: Notebook) => {
      setNotebooks((prev) => [...prev, notebook]);
      setActiveId(notebook.id);
      void saveNotebook(notebook).catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Could not save the new notebook.');
      });
    },
    [toast],
  );

  const handleCreateNotebook = useCallback(
    (name: string) => {
      const template = activeNotebook;
      createAndOpen(
        createNotebook(name, {
          // Inherit the look of what you are already working in.
          theme: template?.theme ?? 'light',
          pageFormat: template?.pageFormat ?? 'Letter',
          pageBackground: template?.pageBackground ?? 'ruled',
          lineSpacingCm: template?.lineSpacingCm ?? 0.8,
          lineColor: template?.lineColor ?? null,
        }),
      );
    },
    [activeNotebook, createAndOpen],
  );

  const handleDuplicate = useCallback(
    (id: string) => {
      const source = notebooks.find((n) => n.id === id);
      if (!source) return;
      createAndOpen({
        ...source,
        id: uid('nb'),
        name: `${source.name} copy`,
        // Fresh object ids so the two copies never collide in selection or undo.
        objects: source.objects.map((o) => ({ ...o, id: uid(o.kind) })),
        updatedAt: Date.now(),
      });
      setModal({ kind: 'none' });
      toast.success('Notebook duplicated.');
    },
    [notebooks, createAndOpen, toast],
  );

  const handleDelete = useCallback(
    (id: string) => {
      setNotebooks((prev) => {
        const remaining = prev.filter((n) => n.id !== id);
        if (activeId === id) setActiveId(remaining[0]?.id ?? null);
        return remaining;
      });
      dirtyNotebooks.current.delete(id);
      const timer = saveTimers.current.get(id);
      if (timer) {
        clearTimeout(timer);
        saveTimers.current.delete(id);
      }
      void deleteNotebookRecord(id).catch(() => {
        /* The notebook is already gone from view. */
      });
      setModal({ kind: 'none' });
      toast.success('Notebook deleted.');
    },
    [activeId, toast],
  );

  const handleAddPage = useCallback(() => {
    if (!activeNotebook) return;
    updateNotebook(activeNotebook.id, { pageCount: activeNotebook.pageCount + 1 });
  }, [activeNotebook, updateNotebook]);

  /* ---------------------------------------------------------------- */
  /* Images                                                            */
  /* ---------------------------------------------------------------- */

  const handleAddImage = useCallback((source: 'library' | 'camera') => {
    if (source === 'camera') cameraInputRef.current?.click();
    else libraryInputRef.current?.click();
  }, []);

  const handleImageFiles = useCallback(
    async (fileList: FileList | null) => {
      const engine = canvasRef.current?.engine;
      if (!fileList || !engine) return;
      const images = [...fileList].filter((f) => f.type.startsWith('image/'));
      if (images.length === 0) {
        toast.error('That file is not an image.');
        return;
      }
      for (const file of images) await engine.insertImage(file);
    },
    [toast],
  );

  /* ---------------------------------------------------------------- */
  /* Fonts                                                             */
  /* ---------------------------------------------------------------- */

  const handleSaveFont = useCallback(
    (font: { id?: string; name: string; characters: Record<string, string> }) => {
      setCustomFonts((prev) => {
        if (font.id) {
          return prev.map((f) =>
            f.id === font.id ? { ...f, name: font.name, characters: font.characters } : f,
          );
        }
        const created: CustomFont = { id: uid('font'), name: font.name, characters: font.characters };
        setToolSettings((tools) => ({ ...tools, fontFamily: created.id, tool: 'text' }));
        return [created, ...prev];
      });
      setModal({ kind: 'none' });
      toast.success('Font saved.');
    },
    [toast],
  );

  /* ---------------------------------------------------------------- */
  /* Print                                                             */
  /* ---------------------------------------------------------------- */

  const handlePrint = useCallback(
    async (pages: number[]) => {
      if (!activeNotebook) return;
      setIsPrinting(true);
      try {
        await printPages(activeNotebook, pages, {
          customFonts,
          pressureEnabled: appSettings.pressureEnabled,
        });
        setModal({ kind: 'none' });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Printing failed.');
      } finally {
        setIsPrinting(false);
        // Leaving hundreds of full-page data URLs in the DOM keeps them in
        // memory for the rest of the session.
        setTimeout(clearPrintContainer, 1000);
      }
    },
    [activeNotebook, customFonts, appSettings.pressureEnabled, toast],
  );

  /* ---------------------------------------------------------------- */
  /* Settings actions                                                  */
  /* ---------------------------------------------------------------- */

  const handleImportFile = useCallback(
    async (file: File) => {
      try {
        const imported = await importNotebookFile(file);
        const hydrated = hydrateNotebook(imported, customFonts);
        createAndOpen(hydrated);
        setModal({ kind: 'none' });
        toast.success(`Imported "${hydrated.name}".`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'That file could not be imported.');
      }
    },
    [customFonts, createAndOpen, toast],
  );

  const handleCleanUpStorage = useCallback(async () => {
    try {
      const removed = await collectGarbage(notebooks);
      toast.success(
        removed > 0
          ? `Removed ${removed} unused image${removed === 1 ? '' : 's'}.`
          : 'Nothing to clean up.',
      );
      return removed;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Clean-up failed.');
      return 0;
    }
  }, [notebooks, toast]);

  const handleClearAll = useCallback(async () => {
    try {
      await clearAllData();
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not clear data.');
    }
  }, [toast]);

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  const withEngine = (fn: (engine: NonNullable<NotebookCanvasHandle['engine']>) => void) => () => {
    const engine = canvasRef.current?.engine;
    if (engine) fn(engine);
  };

  const modalNotebook =
    'id' in modal ? notebooks.find((n) => n.id === (modal as { id: string }).id) ?? null : null;

  if (!ready) {
    return (
      <div className="flex h-[100dvh] w-screen items-center justify-center bg-slate-950 text-slate-400">
        <SpinnerIcon className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-slate-950 text-slate-200">
      <NotebookTabs
        notebooks={notebooks}
        activeId={activeId}
        onSelect={setActiveId}
        onCreate={handleCreateNotebook}
        onOpenActions={(id) => setModal({ kind: 'actions', id })}
        renamingId={renamingId}
        onCommitRename={(id, name) => {
          if (name.trim()) updateNotebook(id, { name: name.trim() });
          setRenamingId(null);
        }}
        onCancelRename={() => setRenamingId(null)}
        onOpenSettings={() => setModal({ kind: 'settings' })}
      />

      {activeNotebook ? (
        <>
          <Toolbar
            settings={toolSettings}
            onSettingsChange={(updater) => setToolSettings(updater)}
            customFonts={customFonts}
            onCreateFont={() => setModal({ kind: 'createFont', editing: null })}
            theme={activeNotebook.theme}
            onToggleTheme={() =>
              updateNotebook(activeNotebook.id, {
                theme: activeNotebook.theme === 'light' ? 'dark' : 'light',
              })
            }
            onUndo={withEngine((e) => e.undo())}
            onRedo={withEngine((e) => e.redo())}
            canUndo={canUndo}
            canRedo={canRedo}
            onAddImage={handleAddImage}
            onOpenPageStyle={() => setModal({ kind: 'pageStyle', id: activeNotebook.id })}
            onOpenShare={() => setModal({ kind: 'share', id: activeNotebook.id })}
            onPrint={() => setModal({ kind: 'print' })}
            rulerVisible={rulerVisible}
            onToggleRuler={withEngine((e) => {
              e.toggleRuler();
              setRulerVisible(e.getRuler().visible);
            })}
          />

          <NotebookCanvas
            ref={canvasRef}
            notebook={activeNotebook}
            toolSettings={toolSettings}
            appSettings={appSettings}
            customFonts={customFonts}
            onDocumentChange={handleDocumentChange}
            onHistoryChange={handleHistoryChange}
            onAddPage={handleAddPage}
            onError={toast.error}
          />
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-2xl font-semibold text-slate-300">No notebooks yet</h1>
          <p className="max-w-sm text-sm text-slate-500">
            Create one with the + button above, or import a .zenith file from Settings.
          </p>
        </div>
      )}

      {modal.kind === 'actions' && modalNotebook && (
        <ActionsModal
          notebook={modalNotebook}
          onClose={() => setModal({ kind: 'none' })}
          onRename={(id) => {
            setModal({ kind: 'none' });
            setRenamingId(id);
          }}
          onEditPages={(id) => setModal({ kind: 'pages', id })}
          onPageStyle={(id) => setModal({ kind: 'pageStyle', id })}
          onShareExport={(id) => setModal({ kind: 'share', id })}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
        />
      )}

      {modal.kind === 'pages' && modalNotebook && (
        <EditPagesModal
          notebook={modalNotebook}
          onClose={() => setModal({ kind: 'none' })}
          onSave={(id, pageCount) => {
            updateNotebook(id, { pageCount });
            setModal({ kind: 'none' });
          }}
        />
      )}

      {modal.kind === 'pageStyle' && modalNotebook && (
        <PageSettingsModal
          notebook={modalNotebook}
          onClose={() => setModal({ kind: 'none' })}
          onSave={(id, update: PageStyleUpdate) => {
            updateNotebook(id, update);
            setModal({ kind: 'none' });
          }}
        />
      )}

      {modal.kind === 'share' && modalNotebook && (
        <ShareExportModal
          notebook={modalNotebook}
          customFonts={customFonts}
          pressureEnabled={appSettings.pressureEnabled}
          onClose={() => setModal({ kind: 'none' })}
          onNotify={(message, tone) => toast.show(message, tone)}
        />
      )}

      {modal.kind === 'print' && activeNotebook && (
        <PrintModal
          totalPages={activeNotebook.pageCount}
          onClose={() => setModal({ kind: 'none' })}
          onPrint={handlePrint}
          isPreparing={isPrinting}
        />
      )}

      {modal.kind === 'settings' && (
        <SettingsModal
          onClose={() => setModal({ kind: 'none' })}
          settings={appSettings}
          onSettingsChange={setAppSettings}
          onClearAllData={handleClearAll}
          onImportFile={handleImportFile}
          onCleanUpStorage={handleCleanUpStorage}
        />
      )}

      {modal.kind === 'createFont' && (
        <CreateFontModal
          editing={modal.editing}
          onClose={() => setModal({ kind: 'none' })}
          onSave={handleSaveFont}
        />
      )}

      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleImageFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void handleImageFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
};

export default App;

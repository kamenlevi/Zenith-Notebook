import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { Notebook } from './components/Notebook';
import { ActionsModal } from './components/ActionsModal';
import { ShareExportModal } from './components/ShareExportModal';
import { EditPagesModal } from './components/EditPagesModal';
import { SettingsModal } from './components/SettingsModal';
import { PageSettingsModal } from './components/PageSettingsModal';
import { CreateFontModal } from './components/CreateFontModal';
import { ToolType } from './types';
import type { Subject, Theme, PageBackground, CustomFont, PageFormat, AppSettings, ImageObject } from './types';

const LOCAL_STORAGE_KEY_SUBJECTS = 'zenith_notebook_subjects';
const LOCAL_STORAGE_KEY_SETTINGS = 'zenith_notebook_settings';
const LOCAL_STORAGE_KEY_FONTS = 'zenith_notebook_fonts';

const defaultSubjects: Subject[] = [
    { id: '1', name: 'Mathematics', canvasState: [], images: [], pageCount: 5, theme: 'light', pageFormat: 'Letter', pageBackground: 'ruled', lineSpacingCm: 0.7, lineColor: null },
    { id: '2', name: 'Biology Notes', canvasState: [], images: [], pageCount: 5, theme: 'dark', pageFormat: 'A4', pageBackground: 'grid', lineSpacingCm: 1, lineColor: null },
];

const App: React.FC = () => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const [actionsModalSubjectId, setActionsModalSubjectId] = useState<string | null>(null);
  const [renamingSubjectId, setRenamingSubjectId] = useState<string | null>(null);
  const [shareExportSubject, setShareExportSubject] = useState<Subject | null>(null);
  const [editingPagesSubject, setEditingPagesSubject] = useState<Subject | null>(null);
  const [editingPageStyleSubject, setEditingPageStyleSubject] = useState<Subject | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({ autoSave: true });
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);
  const [isCreateFontModalOpen, setIsCreateFontModalOpen] = useState(false);
  const [isRulerVisible, setIsRulerVisible] = useState(false);
  const notebookRef = useRef<{ renderFullCanvas: () => Promise<HTMLCanvasElement | null> }>(null);

  // Load settings, subjects, and fonts on initial render
  useEffect(() => {
    // Load settings
    const savedSettingsRaw = localStorage.getItem(LOCAL_STORAGE_KEY_SETTINGS);
    const savedSettings = savedSettingsRaw ? JSON.parse(savedSettingsRaw) : { autoSave: true };
    setSettings(savedSettings);

    // Load custom fonts
    const savedFontsRaw = localStorage.getItem(LOCAL_STORAGE_KEY_FONTS);
    if (savedFontsRaw) {
      try {
        const savedFonts = JSON.parse(savedFontsRaw);
        setCustomFonts(savedFonts);
      } catch (error) {
        console.error("Failed to parse custom fonts from localStorage", error);
      }
    }

    // Load subjects if autoSave is on
    if (savedSettings.autoSave) {
      const savedSubjectsRaw = localStorage.getItem(LOCAL_STORAGE_KEY_SUBJECTS);
      if (savedSubjectsRaw) {
        try {
          const savedSubjects = JSON.parse(savedSubjectsRaw);
          // Add fallback for new properties if loading old data
          const subjectsWithDefaults = savedSubjects.map((s: any) => ({
            ...s,
            canvasState: Array.isArray(s.canvasState) ? s.canvasState : [],
            images: s.images || [],
            pageFormat: s.pageFormat || 'Letter',
            pageBackground: s.pageBackground || 'ruled',
            lineSpacingCm: s.lineSpacingCm || 0.7,
            lineColor: s.lineColor !== undefined ? s.lineColor : null,
          }));
          setSubjects(subjectsWithDefaults);
          if (subjectsWithDefaults.length > 0) {
            setActiveSubjectId(subjectsWithDefaults[0].id);
          }
        } catch (error) {
          console.error("Failed to parse subjects from localStorage", error);
          setSubjects(defaultSubjects);
          setActiveSubjectId(defaultSubjects.length > 0 ? defaultSubjects[0].id : null);
        }
      } else {
         setSubjects(defaultSubjects);
         setActiveSubjectId(defaultSubjects.length > 0 ? defaultSubjects[0].id : null);
      }
    } else {
        setSubjects(defaultSubjects);
        setActiveSubjectId(defaultSubjects.length > 0 ? defaultSubjects[0].id : null);
    }
  }, []);

  // Save subjects to localStorage
  useEffect(() => {
    if (settings.autoSave) {
      localStorage.setItem(LOCAL_STORAGE_KEY_SUBJECTS, JSON.stringify(subjects));
    }
  }, [subjects, settings.autoSave]);
  
  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  }, [settings]);

  // Save custom fonts to localStorage
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY_FONTS, JSON.stringify(customFonts));
  }, [customFonts]);

  // Handle shared URL import
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#data=')) {
      try {
        const base64Data = hash.substring(6);
        const jsonData = decodeURIComponent(escape(atob(base64Data)));
        const sharedSubjectData = JSON.parse(jsonData);

        if (sharedSubjectData.name && typeof sharedSubjectData.pageCount === 'number') {
          const newSubject: Subject = {
            id: new Date().toISOString(),
            name: `Shared: ${sharedSubjectData.name}`,
            canvasState: Array.isArray(sharedSubjectData.canvasState) ? sharedSubjectData.canvasState : [],
            images: sharedSubjectData.images || [],
            pageCount: sharedSubjectData.pageCount,
            theme: sharedSubjectData.theme || 'light',
            pageFormat: sharedSubjectData.pageFormat || 'Letter',
            pageBackground: sharedSubjectData.pageBackground || 'ruled',
            lineSpacingCm: sharedSubjectData.lineSpacingCm || 0.7,
            lineColor: sharedSubjectData.lineColor !== undefined ? sharedSubjectData.lineColor : null,
          };
          
          setSubjects(prev => {
            const isDuplicate = prev.some(s => 
                JSON.stringify(s.canvasState) === JSON.stringify(newSubject.canvasState) && s.name === newSubject.name
            );
            if (isDuplicate) return prev;
            return [...prev, newSubject];
          });
          setActiveSubjectId(newSubject.id);

          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          alert(`Successfully imported "${sharedSubjectData.name}"!`);
        }
      } catch (error) {
        console.error("Failed to parse shared subject data:", error);
        alert("Could not import the shared notebook. The link may be corrupted.");
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  }, []);

  const handleAddSubjectClick = useCallback(() => {
    setIsAddingSubject(true);
  }, []);

  const handleCreateSubject = useCallback((name: string) => {
    if (name.trim()) {
      const newSubject: Subject = {
        id: new Date().toISOString(),
        name: name.trim(),
        canvasState: [],
        images: [],
        pageCount: 5,
        theme: 'light',
        pageFormat: 'Letter',
        pageBackground: 'ruled',
        lineSpacingCm: 0.7,
        lineColor: null,
      };
      setSubjects(prev => [...prev, newSubject]);
      setActiveSubjectId(newSubject.id);
    }
    setIsAddingSubject(false);
  }, []);

  const updateSubjectProperty = useCallback((id: string, updates: Partial<Subject>) => {
    setSubjects(prevSubjects =>
      prevSubjects.map(subject =>
        subject.id === id ? { ...subject, ...updates } : subject
      )
    );
  }, []);

  const handleSubjectActions = useCallback((subjectId: string) => {
    setActionsModalSubjectId(subjectId);
  }, []);
  
  const handleDeleteSubject = useCallback((subjectId: string) => {
    if (window.confirm('Are you sure you want to delete this subject and all its content?')) {
      setSubjects(prev => {
        const remaining = prev.filter(s => s.id !== subjectId);
        if (activeSubjectId === subjectId) {
          setActiveSubjectId(remaining.length > 0 ? remaining[0].id : null);
        }
        return remaining;
      });
    }
    setActionsModalSubjectId(null);
  }, [activeSubjectId]);

  const handleStartRenameSubject = useCallback((subjectId: string) => {
    setRenamingSubjectId(subjectId);
    setActionsModalSubjectId(null);
  }, []);

  const handleUpdateSubjectName = useCallback((subjectId: string, newName: string) => {
    if (newName.trim()) {
      updateSubjectProperty(subjectId, { name: newName.trim() });
    }
    setRenamingSubjectId(null);
  }, [updateSubjectProperty]);

  const handleShareExportSubject = useCallback((subject: Subject) => {
    setShareExportSubject(subject);
    setActionsModalSubjectId(null);
  }, []);

  const handleStartEditPages = useCallback((subjectId: string) => {
    const subjectToEdit = subjects.find(s => s.id === subjectId);
    if (subjectToEdit) {
      setEditingPagesSubject(subjectToEdit);
    }
    setActionsModalSubjectId(null);
  }, [subjects]);
  
  const handleStartEditPageStyle = useCallback((subjectId: string) => {
    const subjectToEdit = subjects.find(s => s.id === subjectId);
    if (subjectToEdit) {
      setEditingPageStyleSubject(subjectToEdit);
    }
  }, [subjects]);

  const handleUpdateSubjectPageCount = useCallback((subjectId: string, newPageCount: number) => {
    updateSubjectProperty(subjectId, { pageCount: newPageCount });
    setEditingPagesSubject(null);
  }, [updateSubjectProperty]);
  
  const handleUpdateSubjectPageStyle = useCallback((subjectId: string, newSettings: { pageFormat: PageFormat; pageBackground: PageBackground; lineSpacingCm: number; lineColor: string | null; }) => {
    updateSubjectProperty(subjectId, newSettings);
    setEditingPageStyleSubject(null);
  }, [updateSubjectProperty]);
  
  const handleClearAllData = useCallback(() => {
    if (window.confirm("Are you sure you want to delete all saved notebook data? This action is irreversible.")) {
      localStorage.removeItem(LOCAL_STORAGE_KEY_SUBJECTS);
      localStorage.removeItem(LOCAL_STORAGE_KEY_SETTINGS);
      localStorage.removeItem(LOCAL_STORAGE_KEY_FONTS);
      window.location.reload();
    }
  }, []);

  const handleImportNotebook = useCallback(async (files: FileList) => {
    if (files.length === 0) return;

    const newSubject: Subject = {
      id: new Date().toISOString(),
      name: `Imported - ${new Date().toLocaleDateString()}`,
      canvasState: [],
      images: [],
      pageCount: files.length,
      theme: 'light',
      pageFormat: 'Letter',
      pageBackground: 'blank',
      lineSpacingCm: 0.7,
      lineColor: null,
    };
    
    const imageObjects: ImageObject[] = [];
    const filePromises = Array.from(files).map((file, index) => {
      return new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (typeof e.target?.result === 'string') {
            if (file.type.startsWith('image/')) {
              const img = new Image();
              img.onload = () => {
                const maxWidth = 816 - 40; // PAGE_WIDTH - margin
                const scale = Math.min(1, maxWidth / img.width);
                const pageTop = index * (1056 + 24); // PAGE_HEIGHT + PAGE_GAP
                imageObjects.push({
                  id: `${newSubject.id}-img-${index}`,
                  src: img.src,
                  x: 20,
                  y: pageTop + 20,
                  width: img.width * scale,
                  height: img.height * scale,
                });
                resolve();
              };
              img.src = e.target.result as string;
            } else if (file.type.startsWith('text/')) {
              newSubject.canvasState.push({
                id: `${newSubject.id}-text-${index}`,
                tool: ToolType.Text,
                text: e.target.result as string,
                x: 40,
                y: (index * (1056 + 24)) + 40,
                fontSize: 16,
                fontFamily: 'Lora',
                color: '#000000',
              });
              resolve();
            } else {
              resolve();
            }
          } else {
            resolve();
          }
        };
        reader.onerror = () => resolve();

        if (file.type.startsWith('image/')) {
          reader.readAsDataURL(file);
        } else if (file.type.startsWith('text/')) {
          reader.readAsText(file);
        } else {
          resolve();
        }
      });
    });

    await Promise.all(filePromises);

    newSubject.images = imageObjects;
    setSubjects(prev => [...prev, newSubject]);
    setActiveSubjectId(newSubject.id);
  }, []);

  const handleSaveCustomFont = useCallback((fontData: Omit<CustomFont, 'id'>) => {
    const newFont: CustomFont = {
      ...fontData,
      id: new Date().toISOString(),
    };
    setCustomFonts(prev => [newFont, ...prev]);
    setIsCreateFontModalOpen(false);
  }, []);

  const activeSubject = subjects.find(s => s.id === activeSubjectId);
  const actionsModalSubject = subjects.find(s => s.id === actionsModalSubjectId);

  return (
    <div className="flex flex-col h-screen w-screen bg-black text-slate-200 overflow-hidden">
      <Sidebar
        subjects={subjects}
        activeSubjectId={activeSubjectId}
        onSelectSubject={setActiveSubjectId}
        onAddSubject={handleAddSubjectClick}
        isAddingSubject={isAddingSubject}
        onCreateSubject={handleCreateSubject}
        onSubjectActions={handleSubjectActions}
        renamingSubjectId={renamingSubjectId}
        onUpdateSubjectName={handleUpdateSubjectName}
        onCancelRename={() => setRenamingSubjectId(null)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />
      
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        {activeSubject ? (
          <Notebook
            ref={notebookRef}
            key={activeSubject.id}
            subject={activeSubject}
            onSaveCanvas={(id, canvasState) => updateSubjectProperty(id, { canvasState })}
            onUpdateImages={(id, images) => updateSubjectProperty(id, { images })}
            onPageCountChange={(id, pageCount) => updateSubjectProperty(id, { pageCount })}
            theme={activeSubject.theme}
            onThemeChange={() => updateSubjectProperty(activeSubject.id, { theme: activeSubject.theme === 'light' ? 'dark' : 'light' })}
            onOpenPageStyleSettings={() => handleStartEditPageStyle(activeSubject.id)}
            customFonts={customFonts}
            onOpenCreateFont={() => setIsCreateFontModalOpen(true)}
            isRulerVisible={isRulerVisible}
            onToggleRuler={() => setIsRulerVisible(v => !v)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-slate-800/50">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-slate-400">Welcome to Zenith Notebook</h1>
              <p className="mt-2 text-slate-500">Select a subject or create a new one to begin.</p>
            </div>
          </div>
        )}
      </main>
      
      {actionsModalSubject && (
        <ActionsModal
          subject={actionsModalSubject}
          onClose={() => setActionsModalSubjectId(null)}
          onDelete={handleDeleteSubject}
          onRename={handleStartRenameSubject}
          onEditPages={handleStartEditPages}
          onShareExport={handleShareExportSubject}
        />
      )}

      {shareExportSubject && (
        <ShareExportModal 
          subject={shareExportSubject} 
          onClose={() => setShareExportSubject(null)} 
          renderCanvas={notebookRef.current?.renderFullCanvas}
        />
      )}

      {editingPagesSubject && (
        <EditPagesModal
          subject={editingPagesSubject}
          onClose={() => setEditingPagesSubject(null)}
          onSave={handleUpdateSubjectPageCount}
        />
      )}

      {editingPageStyleSubject && (
        <PageSettingsModal
          subject={editingPageStyleSubject}
          onClose={() => setEditingPageStyleSubject(null)}
          onSave={handleUpdateSubjectPageStyle}
        />
      )}
      
      {isSettingsModalOpen && (
        <SettingsModal
            onClose={() => setIsSettingsModalOpen(false)}
            settings={settings}
            onSettingsChange={setSettings}
            onClearAllData={handleClearAllData}
            onImportNotebook={handleImportNotebook}
        />
      )}

      {isCreateFontModalOpen && (
        <CreateFontModal
          onClose={() => setIsCreateFontModalOpen(false)}
          onSave={handleSaveCustomFont}
        />
      )}
    </div>
  );
};

export default App;
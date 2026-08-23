import React, { useEffect, useRef, useState } from 'react';
import type { Notebook } from '../types';
import { BookIcon, EllipsisVerticalIcon, PlusIcon, SettingsIcon } from './Icons';

interface Props {
  notebooks: Notebook[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onOpenActions: (id: string) => void;
  renamingId: string | null;
  onCommitRename: (id: string, name: string) => void;
  onCancelRename: () => void;
  onOpenSettings: () => void;
}

export const NotebookTabs: React.FC<Props> = ({
  notebooks,
  activeId,
  onSelect,
  onCreate,
  onOpenActions,
  renamingId,
  onCommitRename,
  onCancelRename,
  onOpenSettings,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const navRef = useRef<HTMLElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAdding) return;
    setDraftName('');
    requestAnimationFrame(() => {
      addInputRef.current?.focus();
      navRef.current?.scrollTo({ left: navRef.current.scrollWidth, behavior: 'smooth' });
    });
  }, [isAdding]);

  useEffect(() => {
    if (!renamingId) return;
    setRenameValue(notebooks.find((n) => n.id === renamingId)?.name ?? '');
  }, [renamingId, notebooks]);

  // Keep the selected tab in view when notebooks are switched from elsewhere.
  useEffect(() => {
    if (!activeId) return;
    const el = navRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(activeId)}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId]);

  const commitAdd = () => {
    const name = draftName.trim();
    setIsAdding(false);
    if (name) onCreate(name);
  };

  return (
    <div className="shrink-0 border-b border-slate-800 bg-slate-950 pt-[env(safe-area-inset-top)]">
      <nav
        ref={navRef}
        className="zn-scroll-x flex items-center gap-1 overflow-x-auto px-2 py-1.5"
        aria-label="Notebooks"
      >
        {notebooks.map((notebook) => {
          const isActive = notebook.id === activeId;
          const isRenaming = notebook.id === renamingId;

          if (isRenaming) {
            return (
              <div
                key={notebook.id}
                className="flex shrink-0 items-center gap-2 rounded-lg border border-sky-500 bg-slate-900 px-3 py-1.5"
              >
                <BookIcon className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => onCommitRename(notebook.id, renameValue)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onCommitRename(notebook.id, renameValue);
                    if (e.key === 'Escape') onCancelRename();
                  }}
                  className="w-32 bg-transparent text-sm text-white outline-none"
                  aria-label="Notebook name"
                />
              </div>
            );
          }

          return (
            <div
              key={notebook.id}
              data-tab-id={notebook.id}
              className={`group flex shrink-0 items-center rounded-lg transition-colors ${
                isActive
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <button
                onClick={() => onSelect(notebook.id)}
                className="flex items-center gap-2 py-1.5 pl-3 pr-1 text-sm"
                aria-current={isActive ? 'page' : undefined}
              >
                <BookIcon className="h-4 w-4 shrink-0" />
                <span className="max-w-[10rem] truncate">{notebook.name}</span>
              </button>
              <button
                onClick={() => onOpenActions(notebook.id)}
                // Always reachable on touch — the old build hid this behind
                // :hover, which never fires on an iPad.
                className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-700 hover:text-slate-200"
                aria-label={`Actions for ${notebook.name}`}
              >
                <EllipsisVerticalIcon className="h-4 w-4" />
              </button>
            </div>
          );
        })}

        {isAdding ? (
          <div className="flex shrink-0 items-center gap-2 rounded-lg border border-sky-500 bg-slate-900 px-3 py-1.5">
            <BookIcon className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              ref={addInputRef}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitAdd}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitAdd();
                if (e.key === 'Escape') setIsAdding(false);
              }}
              placeholder="Notebook name"
              className="w-36 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
              aria-label="New notebook name"
            />
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-900 hover:text-slate-200"
            aria-label="New notebook"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        )}

        <div className="flex-1" />

        <button
          onClick={onOpenSettings}
          className="sticky right-0 shrink-0 rounded-lg bg-slate-950 p-2 text-slate-400 transition-colors hover:bg-slate-900 hover:text-slate-200"
          aria-label="Settings"
        >
          <SettingsIcon className="h-5 w-5" />
        </button>
      </nav>
    </div>
  );
};

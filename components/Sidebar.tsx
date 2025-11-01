import React, { useState, useEffect, useRef } from 'react';
import type { Subject } from '../types';
import { PlusIcon, BookIcon, SettingsIcon, EllipsisVerticalIcon, ArrowUpTrayIcon as PublishIcon } from './Icons';

interface SidebarProps {
  subjects: Subject[];
  activeSubjectId: string | null;
  onSelectSubject: (id: string) => void;
  onAddSubject: () => void;
  isAddingSubject: boolean;
  onCreateSubject: (name: string) => void;
  onSubjectActions: (id: string) => void;
  renamingSubjectId: string | null;
  onUpdateSubjectName: (id: string, newName: string) => void;
  onCancelRename: () => void;
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  subjects,
  activeSubjectId,
  onSelectSubject,
  onAddSubject,
  isAddingSubject,
  onCreateSubject,
  onSubjectActions,
  renamingSubjectId,
  onUpdateSubjectName,
  onCancelRename,
  onOpenSettings,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (isAddingSubject) {
      inputRef.current?.focus();
      navRef.current?.scrollTo({ left: navRef.current.scrollWidth, behavior: 'smooth' });
      setInputValue(''); 
    }
  }, [isAddingSubject]);

  useEffect(() => {
    if (renamingSubjectId) {
      const subjectToRename = subjects.find(s => s.id === renamingSubjectId);
      if (subjectToRename) {
        setRenameValue(subjectToRename.name);
      }
    }
  }, [renamingSubjectId, subjects]);

  const handleCreate = () => {
    onCreateSubject(inputValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleCreate();
    if (e.key === 'Escape') onCreateSubject('');
  };

  const handleRenameCommit = (subjectId: string) => {
    onUpdateSubjectName(subjectId, renameValue);
  };
  
  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, subjectId: string) => {
    if (e.key === 'Enter') handleRenameCommit(subjectId);
    if (e.key === 'Escape') onCancelRename();
  };

  return (
    <div className="w-full bg-black border-b border-slate-800 shrink-0">
      <nav ref={navRef} className="flex items-center gap-1 p-2 overflow-x-auto">
        {subjects.map(subject => {
          const isRenaming = renamingSubjectId === subject.id;
          const isActive = activeSubjectId === subject.id;
          const buttonBaseClasses = 'flex-shrink-0 text-left px-4 py-2 rounded-t-md flex items-center transition-colors duration-200 border-b-2';

          return isRenaming ? (
            <div key={subject.id} className={`${buttonBaseClasses} bg-slate-900 border-slate-300`}>
              <BookIcon className="mr-2 shrink-0 h-4 w-4 text-slate-400"/>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => handleRenameKeyDown(e, subject.id)}
                onBlur={() => handleRenameCommit(subject.id)}
                autoFocus
                className="bg-transparent text-sm text-white placeholder-slate-500 outline-none w-32"
                aria-label="Rename subject"
              />
            </div>
          ) : (
            <div key={subject.id} className={`group relative ${buttonBaseClasses} ${
                isActive
                  ? 'bg-slate-900 border-slate-300 text-white'
                  : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}>
                <button
                    onClick={() => onSelectSubject(subject.id)}
                    className="flex items-center w-full"
                >
                    <BookIcon className="mr-2 shrink-0 h-4 w-4"/>
                    <span className="text-sm truncate pr-6">{subject.name}</span>
                </button>
                <button 
                    onClick={() => onSubjectActions(subject.id)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-500 hover:bg-slate-700 hover:text-slate-200 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    aria-label={`Actions for ${subject.name}`}
                >
                    <EllipsisVerticalIcon className="w-4 h-4" />
                </button>
            </div>
          );
        })}
        
        {isAddingSubject ? (
          <div className="flex-shrink-0 text-left px-4 py-2 rounded-t-md flex items-center bg-slate-900 border-b-2 border-slate-300">
            <BookIcon className="mr-2 shrink-0 h-4 w-4 text-slate-400"/>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleCreate}
              placeholder="Subject Name..."
              className="bg-transparent text-sm text-white placeholder-slate-500 outline-none w-32"
              aria-label="New subject name"
            />
          </div>
        ) : (
          <button
            onClick={onAddSubject}
            className="flex-shrink-0 p-3 text-slate-400 rounded-md hover:bg-slate-800 hover:text-slate-200 transition-colors duration-200 flex items-center justify-center ml-1"
            aria-label="Add new subject"
          >
            <PlusIcon className="w-5 h-5" />
          </button>
        )}
        <div className="flex-grow" />
         <button
            onClick={onOpenSettings}
            className="flex-shrink-0 p-3 text-slate-400 rounded-md hover:bg-slate-800 hover:text-slate-200 transition-colors duration-200 flex items-center justify-center"
            aria-label="Open settings"
          >
            <SettingsIcon className="w-5 h-5" />
          </button>
      </nav>
    </div>
  );
};
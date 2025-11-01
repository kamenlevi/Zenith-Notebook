import React from 'react';
import type { AppSettings } from '../types';
import { Modal } from './Modal';

interface SettingsModalProps {
  onClose: () => void;
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onClearAllData: () => void;
  onImportNotebook: (files: FileList) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, settings, onSettingsChange, onClearAllData, onImportNotebook }) => {
  const importInputRef = React.useRef<HTMLInputElement>(null);

  const handleAutoSaveChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSettingsChange({ ...settings, autoSave: e.target.checked });
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onImportNotebook(e.target.files);
      onClose(); // Close modal after selection
    }
  };


  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="space-y-6">
        
        {/* Auto-save Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label htmlFor="auto-save" className="font-medium text-slate-300">
              Auto-save Progress
            </label>
            <p className="text-sm text-slate-400">
              Automatically save all changes locally in your browser.
            </p>
          </div>
          <label htmlFor="auto-save" className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              id="auto-save" 
              className="sr-only peer"
              checked={settings.autoSave}
              onChange={handleAutoSaveChange}
            />
            <div className="w-11 h-6 bg-slate-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
          </label>
        </div>
        
        <div className="border-t border-slate-700"></div>

        {/* Import Section */}
        <div>
          <h4 className="font-medium text-slate-300">Auto Transfer</h4>
          <p className="text-sm text-slate-400 mb-3">
            Import a notebook from another app. For best results, export your notebook as a series of images (PNG, JPG) or text files (TXT, MD) and select them all.
          </p>
          <button 
            onClick={handleImportClick}
            className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 font-semibold px-4 py-2 rounded-md transition-colors text-sm w-full"
          >
            Import Notebook (from Files)
          </button>
          <input
            type="file"
            ref={importInputRef}
            multiple
            accept="image/*,.txt,.md,text/plain,text/markdown"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>

        <div className="border-t border-slate-700"></div>

        {/* Clear Data Section */}
        <div>
          <h4 className="font-medium text-slate-300">Danger Zone</h4>
          <p className="text-sm text-slate-400 mb-3">
            This will permanently remove all your saved subjects and drawings.
          </p>
          <button 
            onClick={onClearAllData}
            className="bg-red-500/20 hover:bg-red-500/30 text-red-400 font-semibold px-4 py-2 rounded-md transition-colors text-sm"
          >
            Clear All Saved Data
          </button>
        </div>

      </div>
    </Modal>
  );
};
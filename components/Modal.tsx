import React from 'react';
import { XIcon } from './Icons';

interface ModalProps {
  children: React.ReactNode;
  title: string;
  onClose: () => void;
}

export const Modal: React.FC<ModalProps> = ({ children, title, onClose }) => {
  return (
    <div 
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 animate-fade-in-backdrop"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-lg shadow-2xl shadow-black/50 border border-slate-700 w-full max-w-md animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-slate-700">
          <h3 className="text-xl font-semibold text-slate-200">{title}</h3>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};
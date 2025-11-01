import React, { useState } from 'react';
import type { Subject } from '../types';
import { Modal } from './Modal';

interface EditPagesModalProps {
  subject: Subject;
  onClose: () => void;
  onSave: (id: string, newPageCount: number) => void;
}

export const EditPagesModal: React.FC<EditPagesModalProps> = ({ subject, onClose, onSave }) => {
  const [pageCount, setPageCount] = useState(subject.pageCount);

  const handleSave = () => {
    const newPageCount = Math.max(1, Math.min(100, pageCount)); // Clamp between 1 and 100
    onSave(subject.id, newPageCount);
  };

  return (
    <Modal title={`Edit Pages for "${subject.name}"`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label htmlFor="page-count" className="block text-sm font-medium text-slate-400 mb-2">
            Number of pages
          </label>
          <input
            id="page-count"
            type="number"
            min="1"
            max="100"
            value={pageCount}
            onChange={(e) => setPageCount(Number(e.target.value))}
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-300"
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button 
            onClick={onClose}
            className="bg-slate-700 hover:bg-slate-600 text-white font-semibold px-4 py-2 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="bg-slate-300 hover:bg-slate-200 text-slate-900 font-bold px-4 py-2 rounded-md transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </Modal>
  );
};
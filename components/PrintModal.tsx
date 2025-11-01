import React, { useState } from 'react';
import { Modal } from './Modal';
import { SpinnerIcon } from './Icons';

interface PrintModalProps {
  totalPages: number;
  onClose: () => void;
  onPrint: (pageSelection: string) => void;
  isPreparing: boolean;
}

export const PrintModal: React.FC<PrintModalProps> = ({ totalPages, onClose, onPrint, isPreparing }) => {
  const [pageSelection, setPageSelection] = useState(`1-${totalPages}`);

  const handlePrint = () => {
    if (!pageSelection.trim()) {
      alert("Please enter which pages you'd like to print.");
      return;
    }
    onPrint(pageSelection);
  };

  return (
    <Modal title="Print Pages" onClose={onClose}>
      {isPreparing ? (
        <div className="flex flex-col items-center justify-center h-32">
          <SpinnerIcon />
          <p className="mt-4 text-slate-400">Preparing your pages...</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="page-selection" className="block text-sm font-medium text-slate-400 mb-2">
              Enter pages or page ranges
            </label>
            <input
              id="page-selection"
              type="text"
              value={pageSelection}
              onChange={(e) => setPageSelection(e.target.value)}
              placeholder="e.g., 1, 3-5, 8"
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-300"
            />
            <p className="text-xs text-slate-500 mt-2">
              There are {totalPages} pages in total. Use commas to separate pages and hyphens for ranges.
            </p>
          </div>
           <p className="text-xs text-slate-500 italic pt-2">
            Note: This will open your device's standard print dialog. Please ensure you have a printer configured.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button 
              onClick={onClose}
              className="bg-slate-700 hover:bg-slate-600 text-white font-semibold px-4 py-2 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handlePrint}
              className="bg-slate-300 hover:bg-slate-200 text-slate-900 font-bold px-4 py-2 rounded-md transition-colors"
            >
              Print
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};
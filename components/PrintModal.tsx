import React, { useMemo, useState } from 'react';
import { Modal, PrimaryButton, SecondaryButton } from './Modal';
import { SpinnerIcon } from './Icons';
import { parsePageRange } from '../lib/exporting';

interface Props {
  totalPages: number;
  onClose: () => void;
  onPrint: (pages: number[]) => void;
  isPreparing: boolean;
}

export const PrintModal: React.FC<Props> = ({ totalPages, onClose, onPrint, isPreparing }) => {
  const [value, setValue] = useState(`1-${totalPages}`);

  // Validate as the user types instead of alerting after the fact.
  const result = useMemo(() => parsePageRange(value, totalPages), [value, totalPages]);

  return (
    <Modal
      title="Print"
      onClose={onClose}
      footer={
        isPreparing ? undefined : (
          <div className="flex justify-end gap-3">
            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
            <PrimaryButton disabled={!!result.error} onClick={() => onPrint(result.pages)}>
              Print {result.pages.length > 0 ? `${result.pages.length} ` : ''}
              {result.pages.length === 1 ? 'page' : 'pages'}
            </PrimaryButton>
          </div>
        )
      }
    >
      {isPreparing ? (
        <div className="flex h-32 flex-col items-center justify-center gap-3">
          <SpinnerIcon className="h-6 w-6" />
          <p className="text-sm text-slate-400">Rendering pages…</p>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-2 block text-sm text-slate-400">Pages</span>
            <input
              type="text"
              value={value}
              autoFocus
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 1, 3-5, 8"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-sky-500"
            />
          </label>
          {result.error ? (
            <p className="text-sm text-red-400">{result.error}</p>
          ) : (
            <p className="text-sm text-slate-500">
              {result.pages.length} of {totalPages} {totalPages === 1 ? 'page' : 'pages'} selected.
            </p>
          )}
          <p className="text-xs text-slate-500">
            Pages are rendered at 2× and sent to your device's print dialog. Choose "Scale to fit"
            there if your paper size differs from the notebook's.
          </p>
        </div>
      )}
    </Modal>
  );
};

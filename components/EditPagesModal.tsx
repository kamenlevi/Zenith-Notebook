import React, { useMemo, useState } from 'react';
import type { Notebook } from '../types';
import { Modal, PrimaryButton, SecondaryButton } from './Modal';
import { getPageSize } from '../lib/geometry';

interface Props {
  notebook: Notebook;
  onClose: () => void;
  onSave: (id: string, pageCount: number) => void;
}

const MIN_PAGES = 1;
const MAX_PAGES = 500;

export const EditPagesModal: React.FC<Props> = ({ notebook, onClose, onSave }) => {
  const [value, setValue] = useState(String(notebook.pageCount));

  const parsed = Number(value);
  const valid = Number.isInteger(parsed) && parsed >= MIN_PAGES && parsed <= MAX_PAGES;

  /**
   * Warn before a reduction throws away work. The old build let you drop from
   * 20 pages to 1 with no indication that anything was about to disappear from
   * view — and it did not even apply the change, because the canvas never
   * re-read the prop.
   */
  const orphaned = useMemo(() => {
    if (!valid || parsed >= notebook.pageCount) return 0;
    const { height } = getPageSize(notebook.pageFormat);
    const cutoff = parsed * (height + 28);
    return notebook.objects.filter((o) => o.bounds.minY >= cutoff).length;
  }, [valid, parsed, notebook]);

  return (
    <Modal
      title="Page count"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-3">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton disabled={!valid} onClick={() => onSave(notebook.id, parsed)}>
            Save
          </PrimaryButton>
        </div>
      }
    >
      <label className="block">
        <span className="mb-2 block text-sm text-slate-400">
          Number of pages ({MIN_PAGES}–{MAX_PAGES})
        </span>
        <input
          type="number"
          inputMode="numeric"
          min={MIN_PAGES}
          max={MAX_PAGES}
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-sky-500"
        />
      </label>

      {!valid && value.trim() !== '' && (
        <p className="mt-2 text-sm text-red-400">
          Enter a whole number between {MIN_PAGES} and {MAX_PAGES}.
        </p>
      )}

      {orphaned > 0 && (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {orphaned} {orphaned === 1 ? 'item is' : 'items are'} on the pages you are removing. They
          stay in the file and reappear if you add the pages back, but you will not be able to see
          or reach them.
        </p>
      )}
    </Modal>
  );
};

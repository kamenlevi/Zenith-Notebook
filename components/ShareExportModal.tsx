import React, { useMemo, useState } from 'react';
import type { CustomFont, Notebook } from '../types';
import { Modal, SecondaryButton } from './Modal';
import { ArrowDownTrayIcon, ClipboardIcon, SpinnerIcon } from './Icons';
import {
  buildShareLink,
  exportNotebookFile,
  exportPdf,
  exportPng,
  parsePageRange,
} from '../lib/exporting';

interface Props {
  notebook: Notebook;
  customFonts: CustomFont[];
  pressureEnabled: boolean;
  onClose: () => void;
  onNotify: (message: string, tone?: 'info' | 'success' | 'error') => void;
}

export const ShareExportModal: React.FC<Props> = ({
  notebook,
  customFonts,
  pressureEnabled,
  onClose,
  onNotify,
}) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [range, setRange] = useState(`1-${notebook.pageCount}`);

  const share = useMemo(() => buildShareLink(notebook), [notebook]);
  const parsedRange = useMemo(
    () => parsePageRange(range, notebook.pageCount),
    [range, notebook.pageCount],
  );

  const renderContext = { customFonts, pressureEnabled };

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    try {
      await task();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Export failed.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    if (!share.url) return;
    try {
      await navigator.clipboard.writeText(share.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onNotify('Your browser blocked clipboard access. Select the link and copy it manually.', 'error');
    }
  };

  return (
    <Modal title="Share and export" onClose={onClose} size="lg">
      <div className="space-y-7">
        <section>
          <h4 className="font-medium text-slate-200">Save as a file</h4>
          <p className="mt-1 text-sm text-slate-400">
            A .zenith file holds everything, images included. Open it on any device with Settings →
            Import.
          </p>
          <SecondaryButton
            className="mt-3 flex items-center gap-2"
            disabled={busy !== null}
            onClick={() =>
              run('file', async () => {
                await exportNotebookFile(notebook);
                onNotify('Notebook file saved.', 'success');
              })
            }
          >
            {busy === 'file' ? <SpinnerIcon className="h-4 w-4" /> : <ArrowDownTrayIcon className="h-4 w-4" />}
            Save .zenith file
          </SecondaryButton>
        </section>

        <div className="h-px bg-slate-800" />

        <section>
          <h4 className="font-medium text-slate-200">Export pages</h4>
          <label className="mt-3 block">
            <span className="mb-2 block text-sm text-slate-400">Which pages</span>
            <input
              type="text"
              value={range}
              onChange={(e) => setRange(e.target.value)}
              placeholder="e.g. 1, 3-5"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-sky-500"
            />
          </label>
          {parsedRange.error && <p className="mt-2 text-sm text-red-400">{parsedRange.error}</p>}

          <div className="mt-3 flex flex-wrap gap-3">
            <SecondaryButton
              className="flex items-center gap-2"
              disabled={busy !== null || !!parsedRange.error}
              onClick={() =>
                run('pdf', async () => {
                  await exportPdf(notebook, parsedRange.pages, renderContext, (message) =>
                    setBusy(message),
                  );
                  onNotify('PDF saved.', 'success');
                })
              }
            >
              {busy === 'pdf' ? <SpinnerIcon className="h-4 w-4" /> : <ArrowDownTrayIcon className="h-4 w-4" />}
              Export PDF
            </SecondaryButton>
            <SecondaryButton
              className="flex items-center gap-2"
              disabled={busy !== null || !!parsedRange.error}
              onClick={() =>
                run('png', async () => {
                  await exportPng(notebook, parsedRange.pages, renderContext);
                  onNotify('Images saved.', 'success');
                })
              }
            >
              {busy === 'png' ? <SpinnerIcon className="h-4 w-4" /> : <ArrowDownTrayIcon className="h-4 w-4" />}
              Export PNG
            </SecondaryButton>
          </div>
          {busy && busy !== 'file' && (
            <p className="mt-2 text-sm text-slate-400">
              {busy === 'pdf' || busy === 'png' ? 'Working…' : busy}
            </p>
          )}
        </section>

        <div className="h-px bg-slate-800" />

        <section>
          <h4 className="font-medium text-slate-200">Share a link</h4>
          <p className="mt-1 text-sm text-slate-400">
            The whole notebook is encoded in the link itself — nothing is uploaded anywhere. Anyone
            opening it gets their own independent copy.
          </p>

          {share.url ? (
            <>
              <div className="mt-3 flex items-center gap-2">
                <input
                  readOnly
                  value={share.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full truncate rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-400 outline-none"
                />
                <SecondaryButton className="flex shrink-0 items-center gap-2" onClick={copyLink}>
                  <ClipboardIcon className="h-4 w-4" />
                  {copied ? 'Copied' : 'Copy'}
                </SecondaryButton>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {Math.round(share.bytes / 1024)} KB link
                {share.reason ? ` · ${share.reason}` : ''}
              </p>
            </>
          ) : (
            <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              {share.reason}
            </p>
          )}
        </section>
      </div>
    </Modal>
  );
};

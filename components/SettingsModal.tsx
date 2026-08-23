import React, { useEffect, useRef, useState } from 'react';
import type { AppSettings } from '../types';
import { Modal, DangerButton, SecondaryButton } from './Modal';
import { FolderIcon, SpinnerIcon, TrashIcon } from './Icons';
import { estimateUsage } from '../lib/storage';

interface Props {
  onClose: () => void;
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onClearAllData: () => void;
  onImportFile: (file: File) => Promise<void>;
  onCleanUpStorage: () => Promise<number>;
}

export const SettingsModal: React.FC<Props> = ({
  onClose,
  settings,
  onSettingsChange,
  onClearAllData,
  onImportFile,
  onCleanUpStorage,
}) => {
  const importRef = useRef<HTMLInputElement>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const refreshUsage = () => void estimateUsage().then(setUsage);
  useEffect(refreshUsage, []);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <Modal title="Settings" onClose={onClose} size="lg">
      <div className="space-y-7">
        <section className="space-y-3">
          <h4 className="font-medium text-slate-200">Behaviour</h4>
          <Toggle
            checked={settings.autoSave}
            onChange={(autoSave) => onSettingsChange({ ...settings, autoSave })}
            label="Save automatically"
            hint="Writes changes to this device's local storage a moment after you stop drawing."
          />
          <Toggle
            checked={settings.pressureEnabled}
            onChange={(pressureEnabled) => onSettingsChange({ ...settings, pressureEnabled })}
            label="Stylus pressure"
            hint="Apple Pencil pressure varies stroke width. Turn off for a uniform line."
          />
          <Toggle
            checked={settings.gestureShortcuts}
            onChange={(gestureShortcuts) => onSettingsChange({ ...settings, gestureShortcuts })}
            label="Two- and three-finger tap"
            hint="Two-finger tap undoes, three-finger tap redoes."
          />
        </section>

        <div className="h-px bg-slate-800" />

        <section>
          <h4 className="font-medium text-slate-200">Import</h4>
          <p className="mt-1 text-sm text-slate-400">
            Open a .zenith file exported from this app on any device.
          </p>
          <SecondaryButton
            className="mt-3 flex items-center gap-2"
            disabled={busy !== null}
            onClick={() => importRef.current?.click()}
          >
            {busy === 'import' ? <SpinnerIcon className="h-4 w-4" /> : <FolderIcon className="h-4 w-4" />}
            Choose a file
          </SecondaryButton>
          <input
            ref={importRef}
            type="file"
            accept=".zenith,application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setBusy('import');
              try {
                await onImportFile(file);
              } finally {
                setBusy(null);
                refreshUsage();
              }
            }}
          />
        </section>

        <div className="h-px bg-slate-800" />

        <section>
          <h4 className="font-medium text-slate-200">Storage</h4>
          <p className="mt-1 text-sm text-slate-400">
            Everything lives in this browser on this device. Nothing is sent to a server.
          </p>
          {usage && usage.quota > 0 && (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all"
                  style={{ width: `${Math.min(100, (usage.usage / usage.quota) * 100)}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs tabular-nums text-slate-500">
                {formatBytes(usage.usage)} used of about {formatBytes(usage.quota)} available
              </p>
            </div>
          )}
          <SecondaryButton
            className="mt-3 flex items-center gap-2"
            disabled={busy !== null}
            onClick={async () => {
              setBusy('clean');
              try {
                const removed = await onCleanUpStorage();
                setUsage(null);
                refreshUsage();
                if (removed === 0) setBusy(null);
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === 'clean' ? <SpinnerIcon className="h-4 w-4" /> : <TrashIcon className="h-4 w-4" />}
            Remove unused images
          </SecondaryButton>
        </section>

        <div className="h-px bg-slate-800" />

        <section>
          <h4 className="font-medium text-red-400">Danger zone</h4>
          <p className="mt-1 text-sm text-slate-400">
            Deletes every notebook, image and hand-drawn font on this device. This cannot be undone.
          </p>
          {confirmClear ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <DangerButton onClick={onClearAllData}>Yes, delete everything</DangerButton>
              <SecondaryButton onClick={() => setConfirmClear(false)}>Cancel</SecondaryButton>
            </div>
          ) : (
            <DangerButton className="mt-3" onClick={() => setConfirmClear(true)}>
              Delete all data
            </DangerButton>
          )}
        </section>
      </div>
    </Modal>
  );
};

const Toggle: React.FC<{
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}> = ({ checked, onChange, label, hint }) => (
  <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 transition-colors hover:bg-slate-800/60">
    <span className="relative mt-0.5 inline-flex shrink-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span className="block h-6 w-10 rounded-full bg-slate-700 transition-colors peer-checked:bg-sky-500" />
      <span className="absolute left-0.5 top-0.5 block h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
    </span>
    <span>
      <span className="block text-sm font-medium text-slate-200">{label}</span>
      <span className="block text-xs leading-snug text-slate-500">{hint}</span>
    </span>
  </label>
);

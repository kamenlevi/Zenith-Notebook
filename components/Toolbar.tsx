import React, { useEffect, useRef, useState } from 'react';
import type { CustomFont, ToolSettings, ToolType, Theme } from '../types';
import { ToolOptions } from './ToolOptions';
import {
  Bars3Icon,
  CameraIcon,
  DocumentArrowUpIcon,
  EraserIcon,
  HighlighterIcon,
  LassoIcon,
  MoonIcon,
  PenIcon,
  PencilIcon,
  PhotoIcon,
  PrintIcon,
  RedoIcon,
  RulerIcon,
  ShareIcon,
  SunIcon,
  TextIcon,
  UndoIcon,
  EllipsisVerticalIcon,
} from './Icons';

interface ToolbarProps {
  settings: ToolSettings;
  onSettingsChange: (updater: (prev: ToolSettings) => ToolSettings) => void;
  customFonts: CustomFont[];
  onCreateFont: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onAddImage: (source: 'library' | 'camera') => void;
  onOpenPageStyle: () => void;
  onOpenShare: () => void;
  onPrint: () => void;
  rulerVisible: boolean;
  onToggleRuler: () => void;
}

const TOOLS: { tool: ToolType; Icon: React.FC<{ className?: string }>; label: string }[] = [
  { tool: 'pen', Icon: PenIcon, label: 'Pen' },
  { tool: 'pencil', Icon: PencilIcon, label: 'Pencil' },
  { tool: 'highlighter', Icon: HighlighterIcon, label: 'Highlighter' },
  { tool: 'eraser', Icon: EraserIcon, label: 'Eraser' },
  { tool: 'text', Icon: TextIcon, label: 'Text' },
  { tool: 'select', Icon: LassoIcon, label: 'Select' },
];

/** Colour chip shown under the active ink tool. */
const ToolButton: React.FC<{
  active: boolean;
  label: string;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, label, color, onClick, children }) => (
  <button
    onClick={onClick}
    title={label}
    aria-label={label}
    aria-pressed={active}
    className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
      active ? 'bg-slate-700 text-white shadow-inner' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
    }`}
  >
    {children}
    {color && (
      <span
        className="absolute bottom-1 left-1/2 h-1.5 w-5 -translate-x-1/2 rounded-full border border-black/25"
        style={{ backgroundColor: color }}
      />
    )}
  </button>
);

const ActionButton: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, disabled, active, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={label}
    aria-label={label}
    aria-pressed={active}
    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-30 ${
      active
        ? 'bg-slate-700 text-white'
        : 'text-slate-400 enabled:hover:bg-slate-800 enabled:hover:text-slate-100'
    }`}
  >
    {children}
  </button>
);

export const Toolbar: React.FC<ToolbarProps> = ({
  settings,
  onSettingsChange,
  customFonts,
  onCreateFont,
  theme,
  onToggleTheme,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onAddImage,
  onOpenPageStyle,
  onOpenShare,
  onPrint,
  rulerVisible,
  onToggleRuler,
}) => {
  const [openPopover, setOpenPopover] = useState<'tool' | 'insert' | 'more' | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const check = () => setCompact(window.innerWidth < 860);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!openPopover) return;
    const onPointerDown = (event: PointerEvent) => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) setOpenPopover(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenPopover(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openPopover]);

  const selectTool = (tool: ToolType) => {
    if (settings.tool === tool && tool !== 'select') {
      // Tapping the active tool reveals its options, the way a real pen case
      // works: pick it up once, then adjust it.
      setOpenPopover((prev) => (prev === 'tool' ? null : 'tool'));
      return;
    }
    onSettingsChange((prev) => ({ ...prev, tool }));
    setOpenPopover(null);
  };

  const chipColor = (tool: ToolType) => {
    if (tool === 'select' || tool === 'eraser') return undefined;
    return settings.colors[tool as 'pen' | 'pencil' | 'highlighter' | 'text'];
  };

  const extras = (
    <>
      <ActionButton label="Ruler" active={rulerVisible} onClick={onToggleRuler}>
        <RulerIcon className="h-5 w-5" />
      </ActionButton>
      <ActionButton label="Page style" onClick={onOpenPageStyle}>
        <Bars3Icon className="h-5 w-5" />
      </ActionButton>
      <ActionButton label="Share and export" onClick={onOpenShare}>
        <ShareIcon className="h-5 w-5" />
      </ActionButton>
      <ActionButton label="Print" onClick={onPrint}>
        <PrintIcon className="h-5 w-5" />
      </ActionButton>
      <ActionButton
        label={theme === 'light' ? 'Switch to dark paper' : 'Switch to light paper'}
        onClick={onToggleTheme}
      >
        {theme === 'light' ? <MoonIcon className="h-5 w-5" /> : <SunIcon className="h-5 w-5" />}
      </ActionButton>
    </>
  );

  return (
    <div
      ref={barRef}
      className="relative z-30 flex shrink-0 items-center gap-1 border-b border-slate-800 bg-slate-950 px-2 py-1.5"
    >
      <div className="flex items-center gap-0.5">
        {TOOLS.map(({ tool, Icon, label }) => (
          <ToolButton
            key={tool}
            active={settings.tool === tool}
            label={label}
            color={settings.tool === tool ? chipColor(tool) : undefined}
            onClick={() => selectTool(tool)}
          >
            <Icon className="h-5 w-5" />
          </ToolButton>
        ))}
      </div>

      <div className="mx-1 h-7 w-px bg-slate-800" />

      <ActionButton label="Undo" onClick={onUndo} disabled={!canUndo}>
        <UndoIcon className="h-5 w-5" />
      </ActionButton>
      <ActionButton label="Redo" onClick={onRedo} disabled={!canRedo}>
        <RedoIcon className="h-5 w-5" />
      </ActionButton>

      <div className="mx-1 h-7 w-px bg-slate-800" />

      <div className="relative">
        <ActionButton
          label="Insert image"
          active={openPopover === 'insert'}
          onClick={() => setOpenPopover((p) => (p === 'insert' ? null : 'insert'))}
        >
          <PhotoIcon className="h-5 w-5" />
        </ActionButton>
        {openPopover === 'insert' && (
          <Popover>
            <PopoverItem
              icon={<PhotoIcon className="h-4 w-4" />}
              label="From photo library"
              onClick={() => {
                setOpenPopover(null);
                onAddImage('library');
              }}
            />
            <PopoverItem
              icon={<CameraIcon className="h-4 w-4" />}
              label="Take a photo"
              onClick={() => {
                setOpenPopover(null);
                onAddImage('camera');
              }}
            />
          </Popover>
        )}
      </div>

      <div className="flex-1" />

      {/* Touch input mode matters enough on iPad to stay visible. */}
      <button
        onClick={() => onSettingsChange((prev) => ({ ...prev, fingerDraws: !prev.fingerDraws }))}
        title={
          settings.fingerDraws
            ? 'Finger draws. Tap to make finger scroll instead.'
            : 'Finger scrolls. Tap to draw with your finger.'
        }
        className={`hidden h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors sm:flex ${
          settings.fingerDraws
            ? 'bg-sky-500/15 text-sky-300'
            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
        }`}
      >
        <span className="text-base leading-none">✍</span>
        {settings.fingerDraws ? 'Finger draws' : 'Finger scrolls'}
      </button>

      {compact ? (
        <div className="relative">
          <ActionButton
            label="More"
            active={openPopover === 'more'}
            onClick={() => setOpenPopover((p) => (p === 'more' ? null : 'more'))}
          >
            <EllipsisVerticalIcon className="h-5 w-5" />
          </ActionButton>
          {openPopover === 'more' && (
            <Popover align="right">
              <PopoverItem
                icon={<RulerIcon className="h-4 w-4" />}
                label={rulerVisible ? 'Hide ruler' : 'Show ruler'}
                onClick={() => {
                  setOpenPopover(null);
                  onToggleRuler();
                }}
              />
              <PopoverItem
                icon={<Bars3Icon className="h-4 w-4" />}
                label="Page style"
                onClick={() => {
                  setOpenPopover(null);
                  onOpenPageStyle();
                }}
              />
              <PopoverItem
                icon={<ShareIcon className="h-4 w-4" />}
                label="Share and export"
                onClick={() => {
                  setOpenPopover(null);
                  onOpenShare();
                }}
              />
              <PopoverItem
                icon={<PrintIcon className="h-4 w-4" />}
                label="Print"
                onClick={() => {
                  setOpenPopover(null);
                  onPrint();
                }}
              />
              <PopoverItem
                icon={
                  theme === 'light' ? <MoonIcon className="h-4 w-4" /> : <SunIcon className="h-4 w-4" />
                }
                label={theme === 'light' ? 'Dark paper' : 'Light paper'}
                onClick={() => {
                  setOpenPopover(null);
                  onToggleTheme();
                }}
              />
              <PopoverItem
                icon={<DocumentArrowUpIcon className="h-4 w-4" />}
                label={settings.fingerDraws ? 'Finger scrolls' : 'Finger draws'}
                onClick={() => {
                  setOpenPopover(null);
                  onSettingsChange((prev) => ({ ...prev, fingerDraws: !prev.fingerDraws }));
                }}
              />
            </Popover>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-0.5">{extras}</div>
      )}

      {openPopover === 'tool' && (
        <div className="absolute left-2 top-full z-50 mt-1.5 animate-fade-in">
          <ToolOptions
            tool={settings.tool}
            settings={settings}
            onChange={onSettingsChange}
            customFonts={customFonts}
            onCreateFont={onCreateFont}
            onClose={() => setOpenPopover(null)}
          />
        </div>
      )}
    </div>
  );
};

const Popover: React.FC<{ children: React.ReactNode; align?: 'left' | 'right' }> = ({
  children,
  align = 'left',
}) => (
  <div
    className={`absolute top-full z-50 mt-1.5 w-56 rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-2xl animate-fade-in ${
      align === 'right' ? 'right-0' : 'left-0'
    }`}
    role="menu"
  >
    {children}
  </div>
);

const PopoverItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}> = ({ icon, label, onClick }) => (
  <button
    role="menuitem"
    onClick={onClick}
    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-slate-800"
  >
    <span className="text-slate-400">{icon}</span>
    {label}
  </button>
);

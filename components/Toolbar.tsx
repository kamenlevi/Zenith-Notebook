import React, { useRef, useState, useEffect } from 'react';
import type { ToolSettings, Theme, CustomFont } from '../types';
import { ToolType } from '../types';
import { PenIcon, PencilIcon, HighlighterIcon, EraserIcon, AddPageIcon, MoonIcon, SunIcon, PrintIcon, UndoIcon, RedoIcon, PlusIcon, Bars3Icon, TextIcon, DocumentArrowUpIcon, PhotoIcon, CameraIcon, RulerIcon } from './Icons';
import { FontMenu } from './FontMenu';

interface ToolbarProps {
  settings: ToolSettings;
  onSettingsChange: React.Dispatch<React.SetStateAction<ToolSettings>>;
  onAddPage: () => void;
  onAddFile: (source: 'gallery' | 'camera' | 'files') => void;
  theme: Theme;
  onThemeChange: () => void;
  onPrint: () => void;
  onUndoPress: () => void;
  onUndoRelease: () => void;
  onRedoPress: () => void;
  onRedoRelease: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onOpenPageStyleSettings: () => void;
  customFonts: CustomFont[];
  onOpenCreateFont: () => void;
  isRulerVisible: boolean;
  onToggleRuler: () => void;
}

const baseColors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7'];

export const Toolbar: React.FC<ToolbarProps> = ({ 
  settings, 
  onSettingsChange, 
  onAddPage, 
  onAddFile,
  theme, 
  onThemeChange, 
  onPrint, 
  onUndoPress, 
  onUndoRelease,
  onRedoPress,
  onRedoRelease,
  canUndo, 
  canRedo,
  onOpenPageStyleSettings,
  customFonts,
  onOpenCreateFont,
  isRulerVisible,
  onToggleRuler,
}) => {
  const customColorInputRef = useRef<HTMLInputElement>(null);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(event.target as Node)) {
        setIsFileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  const handleToolChange = (tool: ToolType) => {
    onSettingsChange(prev => ({ ...prev, tool }));
  };
  
  const handleColorChange = (color: string) => {
    onSettingsChange(prev => ({ ...prev, color }));
  };
  
  const handleFontChange = (fontFamily: string) => {
    onSettingsChange(prev => ({ ...prev, fontFamily }));
  };

  const ToolButton = ({ tool, Icon }: { tool: ToolType; Icon: React.FC<{className?:string}> }) => (
    <button
      onClick={() => handleToolChange(tool)}
      className={`p-3 rounded-md transition-colors ${
        settings.tool === tool ? 'bg-slate-600 text-white' : 'hover:bg-slate-700'
      }`}
      aria-label={`Select ${tool} tool`}
    >
      <Icon />
    </button>
  );

  const showColorPalette = [ToolType.Pen, ToolType.Pencil, ToolType.Highlighter, ToolType.Text].includes(settings.tool);
  const presetColors = [theme === 'light' ? '#000000' : '#FFFFFF', ...baseColors];
  const isCustomColor = !presetColors.includes(settings.color);

  return (
    <div className="flex justify-center p-2 border-b border-slate-800">
      <div className="flex items-center gap-2 bg-slate-800/80 backdrop-blur-lg border border-slate-700 rounded-xl p-2 flex-wrap justify-center">
        <div className="flex items-center border-r border-slate-700 pr-2">
          <ToolButton tool={ToolType.Pen} Icon={PenIcon} />
          <ToolButton tool={ToolType.Pencil} Icon={PencilIcon} />
          <ToolButton tool={ToolType.Highlighter} Icon={HighlighterIcon} />
          <ToolButton tool={ToolType.Text} Icon={TextIcon} />
          <ToolButton tool={ToolType.Eraser} Icon={EraserIcon} />
        </div>
        
        <div className="flex items-center border-r border-slate-700 px-1">
          <button 
            onMouseDown={onUndoPress}
            onTouchStart={(e) => { e.preventDefault(); onUndoPress(); }}
            onMouseUp={onUndoRelease}
            onMouseLeave={onUndoRelease}
            onTouchEnd={onUndoRelease}
            onTouchCancel={onUndoRelease}
            disabled={!canUndo} 
            className="p-3 rounded-md transition-colors text-slate-300 enabled:hover:bg-slate-700 disabled:opacity-50" 
            aria-label="Undo"
          >
              <UndoIcon />
          </button>
          <button 
            onMouseDown={onRedoPress}
            onTouchStart={(e) => { e.preventDefault(); onRedoPress(); }}
            onMouseUp={onRedoRelease}
            onMouseLeave={onRedoRelease}
            onTouchEnd={onRedoRelease}
            onTouchCancel={onRedoRelease}
            disabled={!canRedo} 
            className="p-3 rounded-md transition-colors text-slate-300 enabled:hover:bg-slate-700 disabled:opacity-50" 
            aria-label="Redo"
          >
              <RedoIcon />
          </button>
        </div>

        {settings.tool === ToolType.Text && (
          <FontMenu
            selectedFont={settings.fontFamily}
            onSelectFont={handleFontChange}
            customFonts={customFonts}
            onCreateNew={onOpenCreateFont}
          />
        )}

        {showColorPalette && (
          <div className="flex items-center gap-2 px-2">
            {presetColors.map(color => (
              <button
                key={color}
                onClick={() => handleColorChange(color)}
                className={`w-7 h-7 rounded-full transition-transform transform hover:scale-110 ${settings.color === color ? 'ring-2 ring-offset-2 ring-offset-slate-800 ring-white' : 'border border-slate-600'}`}
                style={{ backgroundColor: color }}
                aria-label={`Select color ${color}`}
              />
            ))}
             <div className="relative w-7 h-7">
                <button
                    onClick={() => customColorInputRef.current?.click()}
                    className={`w-full h-full rounded-full transition-transform transform hover:scale-110 border border-slate-600 flex items-center justify-center
                      ${isCustomColor ? 'ring-2 ring-offset-2 ring-offset-slate-800 ring-white' : ''}
                    `}
                    style={{ backgroundColor: isCustomColor ? settings.color : undefined }}
                    aria-label="Select custom color"
                >
                    {!isCustomColor && 
                      <div className="w-full h-full rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 flex items-center justify-center">
                        <PlusIcon className="w-4 h-4 text-white mix-blend-difference" />
                      </div>
                    }
                </button>
                <input
                    ref={customColorInputRef}
                    type="color"
                    value={settings.color}
                    onChange={(e) => handleColorChange(e.target.value)}
                    className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
                />
            </div>
          </div>
        )}

        <div className="flex items-center border-l border-slate-700 pl-2 gap-1">
            <button
              onClick={onAddPage}
              className="p-3 rounded-md transition-colors text-slate-300 hover:bg-slate-700 flex items-center gap-2"
              aria-label="Add new page"
            >
              <AddPageIcon />
              <span className="text-sm pr-2 hidden sm:inline">Add Page</span>
            </button>
            <div className="relative" ref={fileMenuRef}>
              <button
                onClick={() => setIsFileMenuOpen(prev => !prev)}
                className="p-3 rounded-md transition-colors text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                aria-haspopup="true"
                aria-expanded={isFileMenuOpen}
                aria-label="Add file"
              >
                <DocumentArrowUpIcon />
                <span className="text-sm pr-2 hidden sm:inline">Add File</span>
              </button>
              {isFileMenuOpen && (
                <div className="absolute top-full mt-2 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl z-40 animate-fade-in text-slate-200" role="menu">
                  <ul className="p-1">
                    <li role="presentation">
                      <button role="menuitem" onClick={() => { onAddFile('gallery'); setIsFileMenuOpen(false); }} className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-md transition-colors duration-150 hover:bg-slate-700">
                        <PhotoIcon className="w-5 h-5" />
                        <span>From Gallery</span>
                      </button>
                    </li>
                    <li role="presentation">
                      <button role="menuitem" onClick={() => { onAddFile('camera'); setIsFileMenuOpen(false); }} className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-md transition-colors duration-150 hover:bg-slate-700">
                        <CameraIcon className="w-5 h-5" />
                        <span>Take Photo</span>
                      </button>
                    </li>
                     <li role="presentation">
                      <button role="menuitem" onClick={() => { onAddFile('files'); setIsFileMenuOpen(false); }} className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-md transition-colors duration-150 hover:bg-slate-700">
                        <DocumentArrowUpIcon className="w-5 h-5" />
                        <span>From Files</span>
                      </button>
                    </li>
                  </ul>
                </div>
              )}
            </div>
             <button
              onClick={onToggleRuler}
              className={`p-3 rounded-md transition-colors ${
                isRulerVisible ? 'bg-slate-600 text-white' : 'text-slate-300 hover:bg-slate-700'
              }`}
              aria-label="Toggle ruler"
            >
              <RulerIcon />
            </button>
             <button
              onClick={onOpenPageStyleSettings}
              className="p-3 rounded-md transition-colors text-slate-300 hover:bg-slate-700"
              aria-label="Change page style"
            >
              <Bars3Icon />
            </button>
            <button
              onClick={onPrint}
              className="p-3 rounded-md transition-colors text-slate-300 hover:bg-slate-700"
              aria-label="Print pages"
            >
              <PrintIcon />
            </button>
            <button
              onClick={onThemeChange}
              className="p-3 rounded-md transition-colors text-slate-300 hover:bg-slate-700"
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? <MoonIcon /> : <SunIcon />}
            </button>
        </div>
      </div>
    </div>
  );
};
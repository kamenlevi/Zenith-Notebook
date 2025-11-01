import React, { useState } from 'react';
import type { Subject, PageBackground, PageFormat } from '../types';
import { Modal } from './Modal';

interface PageSettingsModalProps {
  subject: Subject;
  onClose: () => void;
  onSave: (id: string, newSettings: { pageFormat: PageFormat; pageBackground: PageBackground; lineSpacingCm: number; lineColor: string | null }) => void;
}

const formatOptions: { id: PageFormat, label: string, description: string }[] = [
    { id: 'Letter', label: 'US Letter (8.5" x 11")', description: 'Standard size for North America.' },
    { id: 'A4', label: 'A4 (210mm x 297mm)', description: 'International standard paper size.' },
    { id: 'Tablet', label: 'Tablet (4:3)', description: 'Optimized for tablet screen ratios.' },
    { id: 'Widescreen', label: 'Widescreen (16:9)', description: 'Landscape orientation, good for slides.' },
];

const pageOptions: { id: PageBackground, label: string, description: string }[] = [
    { id: 'ruled', label: 'Ruled', description: 'Standard grey lines with tighter spacing.' },
    { id: 'grid', label: 'Grid', description: 'A versatile grey grid for layouts.' },
    { id: 'custom-ruled', label: 'Custom Ruled', description: 'Set your own line spacing in centimeters.' },
    { id: 'blank', label: 'Blank', description: 'A clean, empty page for freeform notes.' },
];

export const PageSettingsModal: React.FC<PageSettingsModalProps> = ({ subject, onClose, onSave }) => {
  const [pageFormat, setPageFormat] = useState<PageFormat>(subject.pageFormat);
  const [pageBackground, setPageBackground] = useState<PageBackground>(subject.pageBackground);
  const [lineSpacingCm, setLineSpacingCm] = useState(subject.lineSpacingCm);
  const [isCustomColor, setIsCustomColor] = useState<boolean>(subject.lineColor !== null);
  const [lineColor, setLineColor] = useState<string>(subject.lineColor || (subject.theme === 'light' ? '#E2E8F0' : '#475569'));


  const handleSave = () => {
    onSave(subject.id, {
      pageFormat,
      pageBackground,
      lineSpacingCm: Math.max(0.1, Math.min(5, lineSpacingCm)), // Clamp between 0.1 and 5 cm
      lineColor: isCustomColor ? lineColor : null,
    });
  };

  return (
    <Modal title={`Page Style for "${subject.name}"`} onClose={onClose}>
      <div className="space-y-6">

        <fieldset>
          <legend className="text-sm font-medium text-slate-400 mb-3">Page Format</legend>
          <div className="space-y-4">
            {formatOptions.map((option) => (
              <div key={option.id} className="relative flex items-start">
                <div className="flex h-6 items-center">
                  <input
                    id={option.id}
                    name="page-format"
                    type="radio"
                    checked={pageFormat === option.id}
                    onChange={() => setPageFormat(option.id)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-600"
                  />
                </div>
                <div className="ml-3 text-sm leading-6">
                  <label htmlFor={option.id} className="font-medium text-slate-300">
                    {option.label}
                  </label>
                  <p className="text-slate-500">{option.description}</p>
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        <div className="border-t border-slate-700"></div>

        <fieldset>
          <legend className="text-sm font-medium text-slate-400 mb-3">Page Background</legend>
          <div className="space-y-4">
            {pageOptions.map((option) => (
              <div key={option.id} className="relative flex items-start">
                <div className="flex h-6 items-center">
                  <input
                    id={option.id}
                    name="page-background"
                    type="radio"
                    checked={pageBackground === option.id}
                    onChange={() => setPageBackground(option.id)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-600"
                  />
                </div>
                <div className="ml-3 text-sm leading-6">
                  <label htmlFor={option.id} className="font-medium text-slate-300">
                    {option.label}
                  </label>
                  <p className="text-slate-500">{option.description}</p>
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        {pageBackground === 'custom-ruled' && (
          <div className="animate-fade-in">
            <label htmlFor="line-spacing" className="block text-sm font-medium text-slate-400 mb-2">
              Line Spacing (cm)
            </label>
            <input
              id="line-spacing"
              type="number"
              step="0.1"
              min="0.1"
              max="5"
              value={lineSpacingCm}
              onChange={(e) => setLineSpacingCm(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-300"
            />
          </div>
        )}

        {['ruled', 'grid', 'custom-ruled'].includes(pageBackground) &&
          <div className="border-t border-slate-700 my-2"></div>
        }
        
        {['ruled', 'grid', 'custom-ruled'].includes(pageBackground) && (
          <fieldset className="animate-fade-in">
              <legend className="text-sm font-medium text-slate-400 mb-3">Line Color</legend>
              <div className="space-y-4">
                  <div className="relative flex items-start">
                      <div className="flex h-6 items-center">
                          <input
                              id="color-auto"
                              name="line-color-mode"
                              type="radio"
                              checked={!isCustomColor}
                              onChange={() => setIsCustomColor(false)}
                              className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-600"
                          />
                      </div>
                      <div className="ml-3 text-sm leading-6">
                          <label htmlFor="color-auto" className="font-medium text-slate-300">
                              Automatic
                          </label>
                          <p className="text-slate-500">Adapts to light/dark mode (Grey).</p>
                      </div>
                  </div>
                  <div className="relative flex items-start">
                      <div className="flex h-6 items-center">
                          <input
                              id="color-custom"
                              name="line-color-mode"
                              type="radio"
                              checked={isCustomColor}
                              onChange={() => setIsCustomColor(true)}
                              className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-600"
                          />
                      </div>
                      <div className="ml-3 text-sm leading-6">
                          <label htmlFor="color-custom" className="font-medium text-slate-300">
                              Custom
                          </label>
                          <p className="text-slate-500">Choose a specific color for lines.</p>
                      </div>
                  </div>
              </div>

              {isCustomColor && (
                  <div className="animate-fade-in pl-9 mt-4">
                      <label htmlFor="line-color-picker" className="block text-sm font-medium text-slate-400 mb-2">
                          Select a color
                      </label>
                      <div className="flex items-center gap-3">
                           <input
                              id="line-color-picker"
                              type="color"
                              value={lineColor}
                              onChange={(e) => setLineColor(e.target.value)}
                              className="w-10 h-10 p-0.5 bg-slate-900 border border-slate-700 rounded-md cursor-pointer"
                          />
                          <span className="text-sm text-slate-400 font-mono uppercase">{lineColor}</span>
                      </div>
                  </div>
              )}
          </fieldset>
        )}


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

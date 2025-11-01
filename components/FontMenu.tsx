import React, { useState, useEffect, useRef } from 'react';
import type { CustomFont } from '../types';
import { ChevronDownIcon, PlusIcon } from './Icons';

interface FontMenuProps {
  selectedFont: string;
  onSelectFont: (fontFamily: string) => void;
  customFonts: CustomFont[];
  onCreateNew: () => void;
}

const standardFonts = [
  // Serif
  'Lora', 'Georgia', 'Times New Roman', 'Playfair Display', 'Merriweather', 'PT Serif',
  'Slabo 27px', 'Baskervville', 'Bitter', 'Cardo', 'Cinzel', 'Cormorant Garamond', 'Crimson Text',
  'Domine', 'EB Garamond', 'Fauna One', 'Frank Ruhl Libre', 'Libre Baskerville', 'Noto Serif',
  'Old Standard TT', 'Spectral', 'Tinos', 'Trirong', 'Vollkorn',
  // Sans-Serif
  'Arial', 'Verdana', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Nunito', 'Raleway', 'Poppins', 
  'Inter', 'Oswald', 'Source Sans Pro', 'Ubuntu', 'Fira Sans', 'Quicksand', 'Exo 2', 'PT Sans',
  'Abril Fatface', 'Alegreya', 'Anton', 'Archivo', 'Arimo', 'Asap', 'Cabin', 'Cairo', 'Dosis',
  'Encode Sans', 'Fjalla One', 'Hind', 'IBM Plex Sans', 'Karla', 'Libre Franklin', 'Muli', 'Noto Sans',
  'Overpass', 'Prompt', 'Proza Libre', 'Rajdhani', 'Rubik', 'Signika', 'Teko', 'Titillium Web',
  'Varela Round', 'Work Sans',
  // Monospace
  'Courier New', 'Source Code Pro', 'Inconsolata', 'Space Mono',
  // Display & Script
  'Bebas Neue', 'Caveat', 'Comfortaa', 'Dancing Script', 'Josefin Sans', 'Lobster', 'Pacifico', 
  'Shadows Into Light', 'Indie Flower', 'Patrick Hand', 'Playball', 'BioRhyme',
].sort();


export const FontMenu: React.FC<FontMenuProps> = ({ selectedFont, onSelectFont, customFonts, onCreateNew }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  useEffect(() => {
    if (isOpen) {
      // Focus search input when dropdown opens
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      setSearchTerm(''); // Reset search on close
    }
  }, [isOpen]);

  const handleSelect = (font: string) => {
    onSelectFont(font);
    setIsOpen(false);
  };

  const getDisplayName = (fontIdentifier: string): string => {
    const customFont = customFonts.find(f => f.id === fontIdentifier);
    return customFont ? customFont.name : fontIdentifier;
  };

  const filteredCustomFonts = customFonts.filter(font => font.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredStandardFonts = standardFonts.filter(font => font.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 bg-slate-700/50 rounded-md hover:bg-slate-700 transition-colors w-40 justify-between"
      >
        <span className="truncate" style={{ fontFamily: standardFonts.includes(selectedFont) ? selectedFont : 'Lora' }}>
          {getDisplayName(selectedFont)}
        </span>
        <ChevronDownIcon className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl z-40 animate-fade-in text-slate-200 flex flex-col">
          <div className="p-2 border-b border-slate-700">
             <input
                ref={searchInputRef}
                type="text"
                placeholder="Search fonts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-1.5 text-slate-300 text-sm placeholder-slate-500 outline-none focus:ring-1 focus:ring-blue-500"
             />
          </div>
          <ul className="p-1 flex-grow overflow-y-auto max-h-72">
            <li>
              <button
                onClick={onCreateNew}
                className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-blue-400 hover:bg-slate-700"
              >
                <PlusIcon className="w-4 h-4" />
                <span>Create New Font</span>
              </button>
            </li>
            
            {filteredCustomFonts.length > 0 && <div className="h-px bg-slate-700 my-1" />}
            {filteredCustomFonts.map(font => (
              <li key={font.id}>
                <button
                  onClick={() => handleSelect(font.id)}
                  className={`w-full text-left px-3 py-2 rounded-md transition-colors hover:bg-slate-700 ${selectedFont === font.id ? 'bg-slate-900' : ''}`}
                >
                  <span className="font-semibold">{font.name}</span>
                </button>
              </li>
            ))}

            {(filteredStandardFonts.length > 0) && <div className="h-px bg-slate-700 my-1" />}
            {filteredStandardFonts.map(font => (
              <li key={font}>
                <button
                  onClick={() => handleSelect(font)}
                  className={`w-full text-left px-3 py-2 rounded-md transition-colors hover:bg-slate-700 ${selectedFont === font ? 'bg-slate-900' : ''}`}
                  style={{ fontFamily: font }}
                >
                  {font}
                </button>
              </li>
            ))}
            
            {searchTerm && filteredCustomFonts.length === 0 && filteredStandardFonts.length === 0 && (
                <li className="px-3 py-2 text-sm text-slate-500 text-center">No fonts found.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
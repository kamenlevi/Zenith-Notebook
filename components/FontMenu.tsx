import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CustomFont } from '../types';
import { ChevronDownIcon, PlusIcon } from './Icons';

interface FontMenuProps {
  selectedFont: string;
  onSelectFont: (fontFamily: string) => void;
  customFonts: CustomFont[];
  onCreateNew: () => void;
  fullWidth?: boolean;
}

/** Fonts already available without a network request. */
const SYSTEM_FONTS = ['Arial', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New'];

const GOOGLE_FONTS = [
  'Lora', 'Playfair Display', 'Merriweather', 'PT Serif', 'Bitter', 'Cardo', 'Cinzel',
  'Cormorant Garamond', 'Crimson Text', 'Domine', 'EB Garamond', 'Libre Baskerville',
  'Noto Serif', 'Spectral', 'Vollkorn', 'Roboto', 'Open Sans', 'Lato', 'Montserrat',
  'Nunito', 'Raleway', 'Poppins', 'Inter', 'Oswald', 'Ubuntu', 'Fira Sans', 'Quicksand',
  'PT Sans', 'Alegreya', 'Anton', 'Archivo', 'Cabin', 'Dosis', 'IBM Plex Sans', 'Karla',
  'Libre Franklin', 'Noto Sans', 'Overpass', 'Rajdhani', 'Rubik', 'Work Sans',
  'Source Code Pro', 'Inconsolata', 'Space Mono', 'JetBrains Mono',
  'Bebas Neue', 'Caveat', 'Comfortaa', 'Dancing Script', 'Josefin Sans', 'Lobster',
  'Pacifico', 'Shadows Into Light', 'Indie Flower', 'Patrick Hand', 'Kalam',
  'Architects Daughter', 'Gloria Hallelujah',
];

const ALL_FONTS = [...SYSTEM_FONTS, ...GOOGLE_FONTS].sort((a, b) => a.localeCompare(b));

const CATALOG_LINK_ID = 'zenith-google-fonts-catalog';

/**
 * The whole catalogue is only fetched the first time the menu opens.
 * Lora ships in index.html so the default face is never late.
 */
const ensureGoogleFontsLoaded = () => {
  if (document.getElementById(CATALOG_LINK_ID)) return;
  const families = GOOGLE_FONTS.filter((f) => f !== 'Lora')
    .map((f) => `family=${f.replace(/ /g, '+')}:wght@400;700`)
    .join('&');
  const link = document.createElement('link');
  link.id = CATALOG_LINK_ID;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  document.head.appendChild(link);
};

export const FontMenu: React.FC<FontMenuProps> = ({
  selectedFont,
  onSelectFont,
  customFonts,
  onCreateNew,
  fullWidth = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    // pointerdown, not mousedown: mousedown never fires for touch on iPadOS,
    // so the old menu could not be dismissed by tapping away.
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      ensureGoogleFontsLoaded();
      requestAnimationFrame(() => searchRef.current?.focus());
    } else {
      setSearch('');
    }
  }, [isOpen]);

  const query = search.trim().toLowerCase();
  const matchingCustom = useMemo(
    () => customFonts.filter((f) => f.name.toLowerCase().includes(query)),
    [customFonts, query],
  );
  const matchingStandard = useMemo(
    () => ALL_FONTS.filter((f) => f.toLowerCase().includes(query)),
    [query],
  );

  const activeCustom = customFonts.find((f) => f.id === selectedFont);
  const displayName = activeCustom ? activeCustom.name : selectedFont;

  return (
    <div ref={wrapperRef} className={`relative ${fullWidth ? 'w-full' : ''}`}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-slate-700 ${
          fullWidth ? 'w-full' : 'w-40'
        }`}
      >
        <span
          className="truncate"
          style={{ fontFamily: activeCustom ? 'Lora, serif' : `"${selectedFont}", Lora, serif` }}
        >
          {displayName}
        </span>
        <ChevronDownIcon className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-2 flex w-64 max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl animate-fade-in">
          <div className="border-b border-slate-700 p-2">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search fonts…"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-sky-500"
            />
          </div>
          <ul className="max-h-72 flex-1 overflow-y-auto overscroll-contain p-1" role="listbox">
            <li>
              <button
                onClick={onCreateNew}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-sky-400 transition-colors hover:bg-slate-800"
              >
                <PlusIcon className="h-4 w-4" />
                Draw a new font
              </button>
            </li>

            {matchingCustom.length > 0 && (
              <li className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-wide text-slate-500">
                Your handwriting
              </li>
            )}
            {matchingCustom.map((font) => (
              <li key={font.id}>
                <button
                  role="option"
                  aria-selected={selectedFont === font.id}
                  onClick={() => {
                    onSelectFont(font.id);
                    setIsOpen(false);
                  }}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-slate-800 ${
                    selectedFont === font.id ? 'bg-slate-800 text-white' : 'text-slate-200'
                  }`}
                >
                  {font.name}
                  <span className="ml-2 text-[11px] text-slate-500">
                    {Object.keys(font.characters ?? {}).length} glyphs
                  </span>
                </button>
              </li>
            ))}

            {matchingStandard.length > 0 && (
              <li className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-wide text-slate-500">
                Fonts
              </li>
            )}
            {matchingStandard.map((font) => (
              <li key={font}>
                <button
                  role="option"
                  aria-selected={selectedFont === font}
                  onClick={() => {
                    onSelectFont(font);
                    setIsOpen(false);
                  }}
                  style={{ fontFamily: `"${font}", Lora, serif` }}
                  className={`w-full rounded-md px-3 py-2 text-left text-base transition-colors hover:bg-slate-800 ${
                    selectedFont === font ? 'bg-slate-800 text-white' : 'text-slate-200'
                  }`}
                >
                  {font}
                </button>
              </li>
            ))}

            {matchingCustom.length === 0 && matchingStandard.length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-slate-500">No fonts found.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

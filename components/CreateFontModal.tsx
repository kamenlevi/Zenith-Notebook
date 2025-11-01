import React, { useState, useCallback, memo, useRef, useEffect } from 'react';
import { Modal } from './Modal';
import { XIcon } from './Icons';

// A-Z, a-z
const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');

interface CreateFontModalProps {
  onClose: () => void;
  onSave: (font: { name: string; characters: Record<string, string> }) => void;
}

export const CreateFontModal: React.FC<CreateFontModalProps> = ({ onClose, onSave }) => {
  const [fontName, setFontName] = useState('');
  const [characterData, setCharacterData] = useState<Record<string, string>>({});

  const handleSave = () => {
    if (!fontName.trim()) {
      alert('Please enter a name for your font.');
      return;
    }
    onSave({ name: fontName.trim(), characters: characterData });
  };

  const handleCharacterUpdate = useCallback((char: string, dataUrl: string) => {
    setCharacterData(prev => ({ ...prev, [char]: dataUrl }));
  }, []);

  return (
    <div 
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 animate-fade-in-backdrop"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-lg shadow-2xl shadow-black/50 border border-slate-700 w-full h-full max-h-[90vh] max-w-4xl animate-fade-in flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-slate-700 shrink-0">
          <h3 className="text-xl font-semibold text-slate-200">Create New Font</h3>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 flex-grow overflow-y-auto">
            <div className="mb-6">
                <label htmlFor="font-name" className="block text-sm font-medium text-slate-400 mb-2">
                    Font Name
                </label>
                <input
                    id="font-name"
                    type="text"
                    value={fontName}
                    onChange={(e) => setFontName(e.target.value)}
                    placeholder="e.g., My Handwriting"
                    className="w-full max-w-xs bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-300"
                />
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-4">
                {characters.map(char => (
                    <CharacterCanvas
                        key={char}
                        character={char}
                        onDrawEnd={handleCharacterUpdate}
                    />
                ))}
            </div>
        </div>
        <div className="flex justify-end gap-3 p-4 border-t border-slate-700 shrink-0">
            <button 
                onClick={onClose}
                className="bg-slate-700 hover:bg-slate-600 text-white font-semibold px-4 py-2 rounded-md transition-colors"
            >
                Cancel
            </button>
            <button 
                onClick={handleSave}
                disabled={!fontName.trim()}
                className="bg-slate-300 hover:bg-slate-200 text-slate-900 font-bold px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Save Font
            </button>
        </div>
      </div>
    </div>
  );
};


// Memoized Character Canvas to prevent re-renders of all 52 canvases on single update
const CharacterCanvas = memo(({ character, onDrawEnd }: { character: string; onDrawEnd: (char: string, dataUrl: string) => void; }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawingRef = useRef(false);

    const drawGuides = (ctx: CanvasRenderingContext2D) => {
      // Baseline guide
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(0, 300, 320, 4);
      // Cap-height guide
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(0, 100, 320, 2);
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
            drawGuides(ctx);
        }
    }, []);

    const startDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        isDrawingRef.current = true;
        ctx.beginPath();
        const { offsetX, offsetY } = event.nativeEvent;
        ctx.moveTo(offsetX * 4, offsetY * 4); // Scale to canvas resolution
    };

    const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawingRef.current) return;
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        const { offsetX, offsetY } = event.nativeEvent;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineTo(offsetX * 4, offsetY * 4); // Scale to canvas resolution
        ctx.stroke();
    };

    const stopDrawing = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        isDrawingRef.current = false;
        onDrawEnd(character, canvas.toDataURL());
    };
    
    const handleClear = (e: React.MouseEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawGuides(ctx); // Redraw guides after clearing
        onDrawEnd(character, canvas.toDataURL());
      }
    }

    return (
        <div className="flex flex-col items-center">
            <div className="relative group">
                <canvas
                    ref={canvasRef}
                    width="320"
                    height="400"
                    style={{ width: 80, height: 100 }}
                    className="bg-slate-900 border border-slate-600 rounded-md cursor-crosshair touch-none"
                    onPointerDown={startDrawing}
                    onPointerMove={draw}
                    onPointerUp={stopDrawing}
                    onPointerLeave={stopDrawing}
                />
                 <button 
                    onClick={handleClear}
                    className="absolute top-1 right-1 p-1 bg-slate-700/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Clear canvas for letter ${character}`}
                >
                    <XIcon className="w-3 h-3"/>
                </button>
            </div>
            <span className="mt-1 text-lg font-semibold text-slate-400">{character}</span>
        </div>
    );
});
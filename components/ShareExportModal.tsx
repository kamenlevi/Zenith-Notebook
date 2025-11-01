import React, { useState } from 'react';
import type { Subject } from '../types';
import { Modal } from './Modal';
import { SpinnerIcon, ClipboardIcon, ArrowDownTrayIcon } from './Icons';

// Assume jspdf is loaded globally from index.html
declare const jspdf: any;

interface ShareExportModalProps {
  subject: Subject;
  onClose: () => void;
  renderCanvas?: () => Promise<HTMLCanvasElement | null>;
}

const PAGE_HEIGHT = 1056;
const PAGE_WIDTH = 816;
const PAGE_GAP = 24;

export const ShareExportModal: React.FC<ShareExportModalProps> = ({ subject, onClose, renderCanvas }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  const generateShareLink = () => {
    const dataToShare = {
      name: subject.name,
      canvasState: subject.canvasState,
      images: subject.images,
      pageCount: subject.pageCount,
      theme: subject.theme,
      pageFormat: subject.pageFormat,
      pageBackground: subject.pageBackground,
      lineSpacingCm: subject.lineSpacingCm,
      lineColor: subject.lineColor,
    };
    const jsonString = JSON.stringify(dataToShare);
    const base64String = btoa(unescape(encodeURIComponent(jsonString)));
    const url = new URL(window.location.href);
    url.hash = `data=${base64String}`;
    return url.toString();
  };

  const shareLink = generateShareLink();

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      alert('Failed to copy link.');
    }
  };

  const handleExportPDF = async () => {
    if (!renderCanvas) {
      alert("Export function is not available at the moment.");
      return;
    }

    setIsExporting(true);
    setExportMessage(`Rendering all pages for PDF...`);

    // Allow UI to update before blocking operation
    setTimeout(async () => {
      const fullCanvas = await renderCanvas();
      if (!fullCanvas) {
        alert("Failed to prepare pages for exporting.");
        setIsExporting(false);
        return;
      }

      setExportMessage(`Generating PDF...`);
      
      const { jsPDF } = jspdf;
      const isLandscape = subject.pageFormat === 'Widescreen';
      const format = (subject.pageFormat === 'A4' || subject.pageFormat === 'Widescreen') ? 'a4' : 'letter';
      const orientation = isLandscape ? 'landscape' : 'portrait';

      const pdf = new jsPDF({
        orientation: orientation,
        unit: 'px',
        format: format,
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < subject.pageCount; i++) {
          if (i > 0) pdf.addPage();
          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = PAGE_WIDTH;
          pageCanvas.height = PAGE_HEIGHT;
          const pageCtx = pageCanvas.getContext('2d');
          if (!pageCtx) continue;

          // Extract the single page from the full canvas strip
          const sourceY = i * PAGE_HEIGHT;
          if (fullCanvas.height > i * (PAGE_HEIGHT + PAGE_GAP)) { // Handle older saves that might be off
            const oldSourceY = i * (PAGE_HEIGHT + PAGE_GAP);
            pageCtx.drawImage(fullCanvas, 0, oldSourceY, PAGE_WIDTH, PAGE_HEIGHT, 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
          } else {
            pageCtx.drawImage(fullCanvas, 0, sourceY, PAGE_WIDTH, PAGE_HEIGHT, 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
          }
          
          const imageData = pageCanvas.toDataURL('image/jpeg', 0.9);
          pdf.addImage(imageData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      }
      
      pdf.save(`${subject.name}.pdf`);
      
      setIsExporting(false);
      onClose();
    }, 10);
  };

  return (
    <Modal title={`Share & Export "${subject.name}"`} onClose={onClose}>
      <div className="space-y-6">
        
        <div>
          <h4 className="font-medium text-slate-300">Share a copy</h4>
          <p className="text-sm text-slate-400 mb-3">
            Anyone with this link can import a snapshot of this subject. Changes you make later won't be reflected.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareLink}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-slate-400 text-sm truncate"
            />
            <button 
              onClick={handleCopyToClipboard}
              className="bg-slate-700 hover:bg-slate-600 text-white font-semibold px-3 py-2 rounded-md transition-colors text-sm flex-shrink-0"
              aria-label="Copy to clipboard"
            >
              {copySuccess ? 'Copied!' : <ClipboardIcon className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <div className="border-t border-slate-700"></div>

        <div>
          <h4 className="font-medium text-slate-300">Export</h4>
          <p className="text-sm text-slate-400 mb-3">
            Download a high-quality copy of your notebook to your device.
          </p>
          {isExporting ? (
             <div className="flex items-center justify-center h-16 bg-slate-900 rounded-md">
                <SpinnerIcon className="w-5 h-5" />
                <p className="ml-3 text-slate-400">{exportMessage}</p>
             </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-1 gap-3">
                <button 
                  onClick={handleExportPDF}
                  className="bg-slate-700 hover:bg-slate-600 text-white font-semibold px-4 py-2 rounded-md transition-colors text-sm flex items-center justify-center gap-2"
                >
                  <ArrowDownTrayIcon className="w-5 h-5" />
                  <span>Export as PDF</span>
                </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
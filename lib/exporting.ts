/**
 * Export, import, print and share.
 *
 * Previously: jsPDF was pulled from a CDN at runtime even though it was a
 * declared dependency; PDF pages were rasterised at 1x and re-encoded as JPEG,
 * so exports looked soft; the share link base64'd the whole notebook — images
 * included — into a URL hash via `String.fromCharCode(...bigArray)`, which
 * throws RangeError on any real notebook; and the page-range parser accepted
 * `"5-1"` or `"abc"` silently.
 */

import type { CustomFont, Notebook, NotebookExport } from '../types';
import { getPageSize } from './geometry';
import { getAsset, putAsset } from './storage';
import { imageSources, renderPage } from './render';
import { preloadImages } from './imageCache';
import { uid } from './id';

/* ------------------------------------------------------------------ */
/* Page ranges                                                         */
/* ------------------------------------------------------------------ */

export interface PageRangeResult {
  pages: number[];
  error: string | null;
}

/** Parse "1, 3-5, 8" into zero-based page indices. */
export const parsePageRange = (input: string, totalPages: number): PageRangeResult => {
  const trimmed = input.trim();
  if (!trimmed) return { pages: [], error: 'Enter at least one page.' };

  const pages = new Set<number>();
  for (const rawPart of trimmed.split(',')) {
    const part = rawPart.trim();
    if (!part) continue;

    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start < 1 || end < 1 || start > totalPages || end > totalPages) {
        return { pages: [], error: `Pages must be between 1 and ${totalPages}.` };
      }
      if (start > end) return { pages: [], error: `"${part}" runs backwards.` };
      for (let i = start; i <= end; i++) pages.add(i - 1);
      continue;
    }

    if (!/^\d+$/.test(part)) return { pages: [], error: `"${part}" is not a page number.` };
    const page = Number(part);
    if (page < 1 || page > totalPages) {
      return { pages: [], error: `Pages must be between 1 and ${totalPages}.` };
    }
    pages.add(page - 1);
  }

  if (pages.size === 0) return { pages: [], error: 'Enter at least one page.' };
  return { pages: [...pages].sort((a, b) => a - b), error: null };
};

/* ------------------------------------------------------------------ */
/* Rendering helpers                                                   */
/* ------------------------------------------------------------------ */

export interface RenderContext {
  customFonts: CustomFont[];
  pressureEnabled: boolean;
}

const renderPages = async (
  notebook: Notebook,
  pages: number[],
  ctx: RenderContext,
  scale: number,
): Promise<HTMLCanvasElement[]> => {
  await preloadImages(imageSources(notebook));
  return pages.map((index) =>
    renderPage(notebook, index, {
      customFonts: ctx.customFonts,
      pressureEnabled: ctx.pressureEnabled,
      scale,
    }),
  );
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))),
      type,
      quality,
    );
  });

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give Safari a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

const safeFilename = (name: string) =>
  name.replace(/[^\w\d\-. ]+/g, '').trim() || 'Notebook';

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

export const exportPdf = async (
  notebook: Notebook,
  pages: number[],
  ctx: RenderContext,
  onProgress?: (message: string) => void,
): Promise<void> => {
  onProgress?.('Loading the PDF engine…');
  // Bundled dependency, code-split — not a CDN script tag.
  const { jsPDF } = await import('jspdf');

  onProgress?.('Rendering pages…');
  const canvases = await renderPages(notebook, pages, ctx, 2);
  if (canvases.length === 0) throw new Error('No pages to export.');

  const { width, height } = getPageSize(notebook.pageFormat);
  const orientation = width > height ? 'landscape' : 'portrait';

  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    // Match the real page geometry instead of forcing everything into
    // letter/a4 and stretching the artwork to fit.
    format: [width, height],
    compress: true,
  });

  for (let i = 0; i < canvases.length; i++) {
    if (i > 0) pdf.addPage([width, height], orientation);
    onProgress?.(`Adding page ${i + 1} of ${canvases.length}…`);
    // PNG keeps handwriting edges sharp; JPEG at 0.9 visibly haloed them.
    const data = canvases[i].toDataURL('image/png');
    pdf.addImage(data, 'PNG', 0, 0, width, height, undefined, 'FAST');
  }

  pdf.save(`${safeFilename(notebook.name)}.pdf`);
};

/* ------------------------------------------------------------------ */
/* PNG                                                                 */
/* ------------------------------------------------------------------ */

export const exportPng = async (
  notebook: Notebook,
  pages: number[],
  ctx: RenderContext,
): Promise<void> => {
  const canvases = await renderPages(notebook, pages, ctx, 2);
  for (let i = 0; i < canvases.length; i++) {
    const blob = await canvasToBlob(canvases[i], 'image/png');
    const suffix = canvases.length > 1 ? ` - page ${pages[i] + 1}` : '';
    downloadBlob(blob, `${safeFilename(notebook.name)}${suffix}.png`);
  }
};

/* ------------------------------------------------------------------ */
/* Print                                                               */
/* ------------------------------------------------------------------ */

export const printPages = async (
  notebook: Notebook,
  pages: number[],
  ctx: RenderContext,
): Promise<void> => {
  const container = document.getElementById('print-container');
  if (!container) throw new Error('Print container is missing.');

  const canvases = await renderPages(notebook, pages, ctx, 2);
  const { width, height } = getPageSize(notebook.pageFormat);
  container.innerHTML = '';
  container.style.setProperty('--print-page-width', `${width}px`);
  container.style.setProperty('--print-page-height', `${height}px`);
  // Ask the browser for the right paper orientation.
  const style = document.createElement('style');
  style.textContent = `@page { size: ${width}px ${height}px; margin: 0; }`;
  container.appendChild(style);

  for (const canvas of canvases) {
    const img = document.createElement('img');
    img.src = canvas.toDataURL('image/png');
    img.className = 'print-page';
    container.appendChild(img);
  }

  // Wait for the images to be laid out, otherwise Safari prints blank sheets.
  await new Promise((resolve) => setTimeout(resolve, 250));
  window.print();
};

export const clearPrintContainer = () => {
  const container = document.getElementById('print-container');
  if (container) container.innerHTML = '';
};

/* ------------------------------------------------------------------ */
/* .zenith files                                                       */
/* ------------------------------------------------------------------ */

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read an image asset.'));
    reader.readAsDataURL(blob);
  });

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const response = await fetch(dataUrl);
  return response.blob();
};

export const buildExportPayload = async (notebook: Notebook): Promise<NotebookExport> => {
  const assets: Record<string, string> = {};
  for (const src of new Set(imageSources(notebook))) {
    if (src.startsWith('data:')) continue;
    const blob = await getAsset(src);
    if (blob) assets[src] = await blobToDataUrl(blob);
  }
  return { format: 'zenith-notebook', version: 2, notebook, assets };
};

export const exportNotebookFile = async (notebook: Notebook): Promise<void> => {
  const payload = await buildExportPayload(notebook);
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  downloadBlob(blob, `${safeFilename(notebook.name)}.zenith`);
};

/**
 * Read a .zenith file back. Image assets are re-keyed so importing the same
 * file twice cannot have the two copies share (and later fight over) assets.
 */
export const importNotebookFile = async (file: File): Promise<Notebook> => {
  let payload: NotebookExport;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (payload?.format !== 'zenith-notebook' || !payload.notebook) {
    throw new Error('That file is not a Zenith notebook.');
  }

  const notebook = normaliseNotebook(payload.notebook);
  notebook.id = uid('nb');
  notebook.updatedAt = Date.now();

  const remap = new Map<string, string>();
  for (const [oldId, dataUrl] of Object.entries(payload.assets ?? {})) {
    const newId = uid('img');
    remap.set(oldId, newId);
    await putAsset(newId, await dataUrlToBlob(dataUrl));
  }
  notebook.objects = notebook.objects.map((obj) =>
    obj.kind === 'image' && remap.has(obj.src) ? { ...obj, src: remap.get(obj.src)! } : obj,
  );

  return notebook;
};

/* ------------------------------------------------------------------ */
/* Share links                                                         */
/* ------------------------------------------------------------------ */

/** Browsers start to choke on URLs past roughly this length. */
export const SHARE_URL_LIMIT = 32_000;

const bytesToBase64 = (bytes: Uint8Array): string => {
  // Chunked, because `String.fromCharCode(...bytes)` blows the call stack
  // for anything more than a few tens of thousands of bytes.
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
};

const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

export interface ShareLinkResult {
  url: string | null;
  /** Set when the notebook is too big to fit in a URL. */
  reason: string | null;
  bytes: number;
}

export const buildShareLink = (notebook: Notebook): ShareLinkResult => {
  const hasImages = notebook.objects.some((o) => o.kind === 'image');
  const payload = {
    ...notebook,
    // Images live in IndexedDB and cannot travel in a URL.
    objects: notebook.objects.filter((o) => o.kind !== 'image'),
  };
  const json = JSON.stringify(payload);
  const encoded = bytesToBase64(new TextEncoder().encode(json));
  const url = `${window.location.origin}${window.location.pathname}#nb=${encoded}`;

  if (url.length > SHARE_URL_LIMIT) {
    return {
      url: null,
      bytes: url.length,
      reason:
        'This notebook is too large for a link. Use "Save as file" and send the .zenith file instead.',
    };
  }
  return {
    url,
    bytes: url.length,
    reason: hasImages
      ? 'Images are not included in share links. Use "Save as file" to include them.'
      : null,
  };
};

export const readShareLink = (hash: string): Notebook | null => {
  if (!hash.startsWith('#nb=')) return null;
  try {
    const json = new TextDecoder().decode(base64ToBytes(hash.slice(4)));
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed.name !== 'string') return null;
    const notebook = normaliseNotebook(parsed);
    notebook.id = uid('nb');
    notebook.name = `${notebook.name} (shared)`;
    notebook.updatedAt = Date.now();
    return notebook;
  } catch {
    return null;
  }
};

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

/** Coerce anything notebook-shaped into a valid Notebook. */
export const normaliseNotebook = (input: any): Notebook => {
  const objects = Array.isArray(input?.objects) ? input.objects : [];
  return {
    id: typeof input?.id === 'string' ? input.id : uid('nb'),
    name: typeof input?.name === 'string' && input.name.trim() ? input.name : 'Untitled',
    objects: objects.filter(
      (o: any) => o && (o.kind === 'stroke' || o.kind === 'text' || o.kind === 'image'),
    ),
    pageCount: Number.isFinite(input?.pageCount)
      ? Math.max(1, Math.min(500, Math.round(input.pageCount)))
      : 5,
    theme: input?.theme === 'dark' ? 'dark' : 'light',
    pageFormat: ['Letter', 'A4', 'Tablet', 'Widescreen'].includes(input?.pageFormat)
      ? input.pageFormat
      : 'Letter',
    pageBackground: ['ruled', 'grid', 'dotted', 'custom-ruled', 'blank'].includes(
      input?.pageBackground,
    )
      ? input.pageBackground
      : 'ruled',
    lineSpacingCm: Number.isFinite(input?.lineSpacingCm)
      ? Math.max(0.2, Math.min(5, input.lineSpacingCm))
      : 0.8,
    lineColor: typeof input?.lineColor === 'string' ? input.lineColor : null,
    updatedAt: Number.isFinite(input?.updatedAt) ? input.updatedAt : Date.now(),
  };
};

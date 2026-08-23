/**
 * Decoded image cache.
 *
 * Image objects reference either an IndexedDB asset id or an inline data URL.
 * The render loop needs a synchronous answer, so it calls `peekImage` and, on a
 * miss, `requestImage` kicks off the load and notifies once it is decoded.
 *
 * The previous build created a brand new `Image()` for every image on every
 * single offscreen re-render, which meant a full decode per stroke.
 */

import { getAsset } from './storage';

const decoded = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement | null>>();
const failed = new Set<string>();
const objectUrls = new Map<string, string>();

export const peekImage = (src: string): HTMLImageElement | null => decoded.get(src) ?? null;

export const hasFailed = (src: string) => failed.has(src);

const decode = (url: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

const resolveUrl = async (src: string): Promise<string | null> => {
  if (src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('http')) return src;
  const existing = objectUrls.get(src);
  if (existing) return existing;
  const blob = await getAsset(src).catch(() => undefined);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  objectUrls.set(src, url);
  return url;
};

/**
 * Ensure `src` is decoded. Resolves with the image, or null if it could not
 * be loaded. Concurrent callers share one load.
 */
export const requestImage = (src: string): Promise<HTMLImageElement | null> => {
  const hit = decoded.get(src);
  if (hit) return Promise.resolve(hit);
  if (failed.has(src)) return Promise.resolve(null);
  const inFlight = pending.get(src);
  if (inFlight) return inFlight;

  const load = (async () => {
    const url = await resolveUrl(src);
    if (!url) {
      failed.add(src);
      pending.delete(src);
      return null;
    }
    const img = await decode(url);
    pending.delete(src);
    if (!img) {
      failed.add(src);
      return null;
    }
    decoded.set(src, img);
    return img;
  })();

  pending.set(src, load);
  return load;
};

export const forgetImage = (src: string) => {
  decoded.delete(src);
  failed.delete(src);
  pending.delete(src);
  const url = objectUrls.get(src);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrls.delete(src);
  }
};

/** Wait for every referenced image to finish decoding — used before export. */
export const preloadImages = async (sources: string[]): Promise<void> => {
  await Promise.all(sources.map((src) => requestImage(src)));
};

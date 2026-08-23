/**
 * Unique ids.
 *
 * The previous build used `new Date().toISOString()` as an object id, which
 * collides for anything created inside the same millisecond — trivially
 * reproducible by drawing quickly, and it silently corrupted undo history
 * and React keys.
 */

let counter = 0;

export const uid = (prefix = 'o'): string => {
  counter = (counter + 1) % 0xffffff;
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${rand}`;
};

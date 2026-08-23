/**
 * Persistence.
 *
 * Notebooks and image assets live in IndexedDB; only small preferences stay in
 * localStorage. The previous build stringified every notebook — base64 image
 * data URLs included — into a single localStorage key with no error handling,
 * so the first photo you inserted could blow the ~5MB quota and every
 * subsequent save threw QuotaExceededError into the void. Nothing was saved
 * from then on and the user was never told.
 */

import type { AppSettings, CustomFont, Notebook, ToolSettings } from '../types';

const DB_NAME = 'zenith-notebook';
const DB_VERSION = 1;
const STORE_NOTEBOOKS = 'notebooks';
const STORE_ASSETS = 'assets';

const LS_SETTINGS = 'zenith_notebook_settings_v2';
const LS_TOOLS = 'zenith_notebook_tools_v2';
const LS_FONTS = 'zenith_notebook_fonts_v2';
const LS_ACTIVE = 'zenith_notebook_active_v2';
const LS_MIGRATED = 'zenith_notebook_migrated_v2';

/* Legacy keys, read once during migration. */
const LEGACY_SUBJECTS = 'zenith_notebook_subjects';
const LEGACY_SETTINGS = 'zenith_notebook_settings';
const LEGACY_FONTS = 'zenith_notebook_fonts';

export class StorageError extends Error {
  readonly quotaExceeded: boolean;
  constructor(message: string, quotaExceeded = false) {
    super(message);
    this.name = 'StorageError';
    this.quotaExceeded = quotaExceeded;
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new StorageError('This browser has no IndexedDB support.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NOTEBOOKS)) {
        db.createObjectStore(STORE_NOTEBOOKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        db.createObjectStore(STORE_ASSETS);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new StorageError(request.error?.message ?? 'Could not open the local database.'));
    request.onblocked = () =>
      reject(new StorageError('The database is locked by another open tab.'));
  });
  return dbPromise;
};

const runTransaction = async <T>(
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> => {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(stores, mode);
    } catch (err) {
      reject(new StorageError((err as Error).message));
      return;
    }
    let result: T;
    let settled = false;
    tx.oncomplete = () => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    tx.onerror = tx.onabort = () => {
      if (settled) return;
      settled = true;
      const err = tx.error;
      const quota = err?.name === 'QuotaExceededError';
      reject(
        new StorageError(
          quota
            ? 'Out of storage space on this device. Delete a notebook or some images and try again.'
            : err?.message ?? 'Saving failed.',
          quota,
        ),
      );
    };
    Promise.resolve(work(tx)).then(
      (value) => {
        result = value;
      },
      (err) => {
        if (settled) return;
        settled = true;
        try {
          tx.abort();
        } catch {
          /* already finished */
        }
        reject(err);
      },
    );
  });
};

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new StorageError(req.error?.message ?? 'Request failed.'));
  });

/* ------------------------------------------------------------------ */
/* Notebooks                                                           */
/* ------------------------------------------------------------------ */

export const loadNotebooks = async (): Promise<Notebook[]> => {
  const rows = await runTransaction([STORE_NOTEBOOKS], 'readonly', (tx) =>
    request(tx.objectStore(STORE_NOTEBOOKS).getAll() as IDBRequest<Notebook[]>),
  );
  return rows.sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0));
};

export const saveNotebook = (notebook: Notebook): Promise<void> =>
  runTransaction([STORE_NOTEBOOKS], 'readwrite', (tx) => {
    tx.objectStore(STORE_NOTEBOOKS).put(notebook);
  });

export const deleteNotebook = (id: string): Promise<void> =>
  runTransaction([STORE_NOTEBOOKS], 'readwrite', (tx) => {
    tx.objectStore(STORE_NOTEBOOKS).delete(id);
  });

/* ------------------------------------------------------------------ */
/* Image assets                                                        */
/* ------------------------------------------------------------------ */

export const putAsset = (id: string, blob: Blob): Promise<void> =>
  runTransaction([STORE_ASSETS], 'readwrite', (tx) => {
    tx.objectStore(STORE_ASSETS).put(blob, id);
  });

export const getAsset = (id: string): Promise<Blob | undefined> =>
  runTransaction([STORE_ASSETS], 'readonly', (tx) =>
    request(tx.objectStore(STORE_ASSETS).get(id) as IDBRequest<Blob | undefined>),
  );

export const deleteAsset = (id: string): Promise<void> =>
  runTransaction([STORE_ASSETS], 'readwrite', (tx) => {
    tx.objectStore(STORE_ASSETS).delete(id);
  });

export const listAssetIds = (): Promise<string[]> =>
  runTransaction([STORE_ASSETS], 'readonly', (tx) =>
    request(tx.objectStore(STORE_ASSETS).getAllKeys() as IDBRequest<IDBValidKey[]>).then((keys) =>
      keys.map(String),
    ),
  );

/** Remove assets no longer referenced by any notebook. */
export const collectGarbage = async (notebooks: Notebook[]): Promise<number> => {
  const referenced = new Set<string>();
  for (const nb of notebooks) {
    for (const obj of nb.objects) {
      if (obj.kind === 'image' && !obj.src.startsWith('data:')) referenced.add(obj.src);
    }
  }
  const all = await listAssetIds();
  const orphans = all.filter((id) => !referenced.has(id));
  for (const id of orphans) await deleteAsset(id);
  return orphans.length;
};

/** Rough storage usage, when the browser will tell us. */
export const estimateUsage = async (): Promise<{ usage: number; quota: number } | null> => {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
};

/* ------------------------------------------------------------------ */
/* Small preferences (localStorage is genuinely the right tool here)   */
/* ------------------------------------------------------------------ */

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Preferences are not worth interrupting the user over. */
  }
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  autoSave: true,
  pressureEnabled: true,
  gestureShortcuts: true,
};

export const loadAppSettings = (): AppSettings => ({
  ...DEFAULT_APP_SETTINGS,
  ...readJson<Partial<AppSettings>>(LS_SETTINGS, {}),
});
export const saveAppSettings = (s: AppSettings) => writeJson(LS_SETTINGS, s);

export const loadToolSettings = (fallback: ToolSettings): ToolSettings => {
  const stored = readJson<Partial<ToolSettings>>(LS_TOOLS, {});
  return {
    ...fallback,
    ...stored,
    colors: { ...fallback.colors, ...(stored.colors ?? {}) },
    sizes: { ...fallback.sizes, ...(stored.sizes ?? {}) },
  };
};
export const saveToolSettings = (s: ToolSettings) => writeJson(LS_TOOLS, s);

export const loadCustomFonts = (): CustomFont[] => readJson<CustomFont[]>(LS_FONTS, []);
export const saveCustomFonts = (fonts: CustomFont[]) => writeJson(LS_FONTS, fonts);

export const loadActiveNotebookId = (): string | null => {
  try {
    return localStorage.getItem(LS_ACTIVE);
  } catch {
    return null;
  }
};
export const saveActiveNotebookId = (id: string | null) => {
  try {
    if (id) localStorage.setItem(LS_ACTIVE, id);
    else localStorage.removeItem(LS_ACTIVE);
  } catch {
    /* ignore */
  }
};

export const clearAllData = async (): Promise<void> => {
  for (const key of [LS_SETTINGS, LS_TOOLS, LS_FONTS, LS_ACTIVE, LS_MIGRATED]) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  try {
    localStorage.removeItem(LEGACY_SUBJECTS);
    localStorage.removeItem(LEGACY_SETTINGS);
    localStorage.removeItem(LEGACY_FONTS);
  } catch {
    /* ignore */
  }
  await runTransaction([STORE_NOTEBOOKS, STORE_ASSETS], 'readwrite', (tx) => {
    tx.objectStore(STORE_NOTEBOOKS).clear();
    tx.objectStore(STORE_ASSETS).clear();
  });
};

/* ------------------------------------------------------------------ */
/* Migration from the v1 localStorage format                           */
/* ------------------------------------------------------------------ */

export const hasMigrated = () => {
  try {
    return localStorage.getItem(LS_MIGRATED) === '1';
  } catch {
    return true;
  }
};

export const markMigrated = () => {
  try {
    localStorage.setItem(LS_MIGRATED, '1');
  } catch {
    /* ignore */
  }
};

export const readLegacySubjects = (): unknown[] | null => {
  try {
    const raw = localStorage.getItem(LEGACY_SUBJECTS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const readLegacyFonts = (): CustomFont[] | null => {
  try {
    const raw = localStorage.getItem(LEGACY_FONTS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CustomFont[]) : null;
  } catch {
    return null;
  }
};

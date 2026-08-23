import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertIcon, CheckIcon, XIcon } from './Icons';

/**
 * Replaces `window.alert`, which the old build used for everything from
 * "link copied" to storage failures. Alerts block the whole page, and on
 * iPadOS they steal focus mid-stroke.
 */

type ToastTone = 'info' | 'success' | 'error';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
  error: (message: string) => void;
  success: (message: string) => void;
}

const ToastContext = createContext<ToastApi>({
  show: () => {},
  error: () => {},
  success: () => {},
});

export const useToast = () => useContext(ToastContext);

const DURATION: Record<ToastTone, number> = { info: 3200, success: 2600, error: 6000 };

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION[tone]),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      error: (message: string) => show(message, 'error'),
      success: (message: string) => show(message, 'success'),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[200] flex flex-col items-center gap-2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-md animate-toast-in ${
              toast.tone === 'error'
                ? 'border-red-500/40 bg-red-950/90 text-red-100'
                : toast.tone === 'success'
                  ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-100'
                  : 'border-slate-600/60 bg-slate-900/95 text-slate-100'
            }`}
          >
            {toast.tone === 'error' ? (
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            ) : toast.tone === 'success' ? (
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
            ) : null}
            <span className="flex-1 leading-snug">{toast.message}</span>
            <button
              onClick={() => dismiss(toast.id)}
              className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
              aria-label="Dismiss"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

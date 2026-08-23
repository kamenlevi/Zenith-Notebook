import React, { useEffect, useRef } from 'react';
import { XIcon } from './Icons';

interface ModalProps {
  children: React.ReactNode;
  title: string;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg';
  footer?: React.ReactNode;
}

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
};

export const Modal: React.FC<ModalProps> = ({ children, title, onClose, size = 'md', footer }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropDownRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    // Move focus into the dialog so Escape and Tab behave.
    panelRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 animate-fade-in-backdrop"
      // Track where the press started: dragging a slider inside the dialog and
      // releasing outside it used to dismiss the whole thing.
      onPointerDown={(e) => {
        backdropDownRef.current = e.target === e.currentTarget;
      }}
      onPointerUp={(e) => {
        if (backdropDownRef.current && e.target === e.currentTarget) onClose();
        backdropDownRef.current = false;
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[min(90vh,calc(100vh-2rem))] w-full ${SIZES[size]} flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl outline-none animate-fade-in`}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <h3 className="truncate text-lg font-semibold text-slate-100">{title}</h3>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            aria-label="Close"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="zn-scroll-y flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>

        {footer && (
          <div className="shrink-0 border-t border-slate-800 px-5 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
};

export const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  className = '',
  ...props
}) => (
  <button
    {...props}
    className={`rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
  />
);

export const SecondaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  className = '',
  ...props
}) => (
  <button
    {...props}
    className={`rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-40 ${className}`}
  />
);

export const DangerButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  className = '',
  ...props
}) => (
  <button
    {...props}
    className={`rounded-lg bg-red-600/90 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-40 ${className}`}
  />
);

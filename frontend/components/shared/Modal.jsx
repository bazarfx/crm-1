'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import clsx from 'clsx';

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export default function Modal({ open, onClose, title, description, size = 'md', children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || typeof window === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className={clsx('w-full bg-white rounded-xl shadow-lg border border-slate-100 animate-modalIn', SIZES[size])}>
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div className="min-w-0">
            {title && <h3 className="text-base font-semibold text-ink-primary">{title}</h3>}
            {description && <p className="text-sm text-ink-secondary mt-0.5">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-ink-primary transition-colors duration-150 -mt-1 -mr-1 p-1 rounded-md hover:bg-surface-alt"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="px-5 py-4 bg-surface-alt rounded-b-xl border-t border-slate-100 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

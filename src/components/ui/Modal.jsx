'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({
  open,
  onClose,
  title,
  children,
  sheetOnMobile = true,
  closable = true,
  maxWidth = 440,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && closable) onClose?.();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose, closable]);

  if (!open) return null;

  return (
    <div
      className={`overlay ${sheetOnMobile ? 'sheet-on-mobile' : ''}`}
      onClick={closable ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Dialog'}
    >
      <div
        className="modal modal-pad"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || closable) && (
          <div className="flex items-center justify-between mb-4">
            {title ? <h3 style={{ fontSize: '1.15rem' }}>{title}</h3> : <span />}
            {closable && (
              <button
                className="btn btn-ghost btn-icon"
                onClick={onClose}
                aria-label="Close dialog"
                style={{ minHeight: 36, width: 36 }}
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

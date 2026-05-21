'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    if (typeof window !== 'undefined') console.error('[crm1]', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-main px-6">
      <div className="card max-w-md w-full text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-4">
          <AlertTriangle size={22} />
        </div>
        <h1 className="text-xl font-semibold text-ink-primary mb-2">Something broke</h1>
        <p className="text-sm text-ink-secondary mb-5">
          {error?.message || 'An unexpected error occurred.'}
        </p>
        <button onClick={reset} className="btn-primary mx-auto">
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    </div>
  );
}

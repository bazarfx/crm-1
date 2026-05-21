import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-main px-6">
      <div className="card max-w-md w-full text-center">
        <p className="mono text-xs text-ink-muted mb-3">ERR_NOT_FOUND</p>
        <h1 className="text-2xl font-semibold text-ink-primary mb-2">404</h1>
        <p className="text-sm text-ink-secondary mb-5">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link href="/dashboard" className="btn-ghost mx-auto inline-flex">
          <ArrowLeft size={14} /> Back to dashboard
        </Link>
      </div>
    </div>
  );
}

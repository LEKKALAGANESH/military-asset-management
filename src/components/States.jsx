import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-slate-400" role="status" aria-live="polite">
      <Loader2 size={18} className="animate-spin" aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center" role="alert">
      <AlertTriangle size={26} className="text-amber-400" aria-hidden="true" />
      <p className="max-w-md text-sm text-slate-300">{message || 'Something went wrong.'}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-ghost">
          Try again
        </button>
      )}
    </div>
  );
}

function EmptyState({ title = 'Nothing to show yet', hint }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <Inbox size={26} className="text-slate-500" aria-hidden="true" />
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {hint && <p className="max-w-md text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/**
 * Renders the right state for a useApi result. Routing all three through one component is
 * what stops a view shipping with a spinner but no empty state.
 */
export function AsyncBoundary({ loading, error, isEmpty, onRetry, emptyTitle, emptyHint, children }) {
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (isEmpty) return <EmptyState title={emptyTitle} hint={emptyHint} />;
  return children;
}

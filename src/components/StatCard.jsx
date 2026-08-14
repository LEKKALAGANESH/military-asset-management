import { ChevronRight } from 'lucide-react';
import { formatNumber } from '../utils/format.js';

const ACCENTS = {
  slate: 'border-l-slate-400',
  emerald: 'border-l-emerald-500',
  amber: 'border-l-amber-500',
  rose: 'border-l-rose-500',
  sky: 'border-l-sky-500',
};

export default function StatCard({ label, value, hint, accent = 'slate', icon: Icon, onClick }) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</h3>
        {Icon && <Icon size={16} className="shrink-0 text-slate-500" aria-hidden="true" />}
      </div>
      <p className="mt-2 font-mono text-2xl font-bold text-slate-50 sm:text-3xl">{formatNumber(value)}</p>
      {hint && (
        <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
          {hint}
          {onClick && <ChevronRight size={12} aria-hidden="true" />}
        </p>
      )}
    </>
  );

  const className = `card border-l-4 p-4 text-left ${ACCENTS[accent] ?? ACCENTS.slate}`;

  // A real button when clickable, so it stays keyboard reachable and announces itself.
  if (!onClick) return <article className={className}>{content}</article>;

  return (
    <button type="button" onClick={onClick} className={`${className} transition hover:bg-night-800`}>
      {content}
    </button>
  );
}

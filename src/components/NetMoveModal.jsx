import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { formatNumber } from '../utils/format.js';

const ROWS = [
  { key: 'purchases', label: 'Purchases', sign: '+', tone: 'text-emerald-400' },
  { key: 'transfersIn', label: 'Transfers In', sign: '+', tone: 'text-emerald-400' },
  { key: 'transfersOut', label: 'Transfers Out', sign: '−', tone: 'text-rose-400' },
];

export default function NetMoveModal({ metrics, open, onClose }) {
  const dialogRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement;
    dialogRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      // Scoped to the backdrop itself so a click inside the dialog doesn't close it.
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="net-move-title"
        tabIndex={-1}
        className="card w-full max-w-md animate-fade-in p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="net-move-title" className="text-lg font-bold text-slate-50">Net Movement Breakdown</h2>
            <p className="mt-1 text-xs text-slate-400">Purchases + Transfers In − Transfers Out</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close breakdown" className="rounded-lg p-1 text-slate-400 hover:bg-night-800 hover:text-slate-200">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <dl className="space-y-2">
          {ROWS.map(({ key, label, sign, tone }) => (
            <div key={key} className="flex items-center justify-between rounded-lg bg-night-800/60 px-3 py-2">
              <dt className="text-sm text-slate-300">{label}</dt>
              <dd className={`font-mono text-sm font-semibold ${tone}`}>
                {sign}{formatNumber(metrics[key])}
              </dd>
            </div>
          ))}

          <div className="!mt-4 flex items-center justify-between border-t border-night-700 pt-3">
            <dt className="text-sm font-bold text-slate-100">Total Net Movement</dt>
            <dd className="font-mono text-lg font-bold text-slate-50">{formatNumber(metrics.netMovement)}</dd>
          </div>
        </dl>

        <div className="mt-5 rounded-lg border border-night-700 bg-night-950/60 p-3 text-xs leading-relaxed text-slate-400">
          <p className="font-semibold text-slate-300">How the closing balance is derived</p>
          <p className="mt-1 font-mono">
            {formatNumber(metrics.openingBalance)} opening
            {' '}{metrics.netMovement < 0 ? '−' : '+'} {formatNumber(Math.abs(metrics.netMovement))} net
            {' '}− {formatNumber(metrics.assigned)} assigned
            {' '}− {formatNumber(metrics.expended)} expended
            {' '}= <span className="text-slate-100">{formatNumber(metrics.closingBalance)}</span>
          </p>
        </div>

        <button type="button" onClick={onClose} className="btn-primary mt-5 w-full">Close</button>
      </div>
    </div>
  );
}

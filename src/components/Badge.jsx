const TONES = {
  emerald: 'bg-emerald-600/15 text-emerald-300',
  sky: 'bg-sky-600/15 text-sky-300',
  amber: 'bg-amber-600/15 text-amber-300',
  violet: 'bg-violet-600/15 text-violet-300',
  rose: 'bg-rose-600/15 text-rose-300',
  slate: 'bg-slate-600/20 text-slate-300',
  neutral: 'bg-night-700 text-slate-300',
};

export default function Badge({ tone = 'neutral', children }) {
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${TONES[tone] ?? TONES.neutral}`}>
      {children}
    </span>
  );
}

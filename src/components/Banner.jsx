import { CheckCircle2, XCircle } from 'lucide-react';

const TONES = {
  success: { className: 'border-emerald-600/40 bg-emerald-600/10 text-emerald-300', Icon: CheckCircle2 },
  error: { className: 'border-rose-600/40 bg-rose-600/10 text-rose-300', Icon: XCircle },
};

// role="alert" so the result is announced, not just coloured.
export default function Banner({ tone = 'success', message }) {
  if (!message) return null;
  const { className, Icon } = TONES[tone] ?? TONES.success;

  return (
    <p role="alert" className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${className}`}>
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}

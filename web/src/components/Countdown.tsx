import { remaining, type Tone } from '../lib/countdown';
import { cx } from '../lib/ui';
import { useSecond } from '../lib/useNow';
import { ClockIcon } from './Icons';

const TONE: Record<Tone, string> = {
  later: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  soon: 'bg-amber-50 text-amber-700 ring-amber-600/30',
  now: 'bg-rose-50 text-rose-700 ring-rose-600/30',
  late: 'bg-rose-50 text-rose-700 ring-rose-600/30',
};

/** Temporizador en vivo hasta la hora del soporte (o desde que se paso). Se oculta si esta lejos. */
export function Countdown({ iso, soonMin = 10, always = false, className }: { iso: string; soonMin?: number; always?: boolean; className?: string }) {
  const now = useSecond();
  const r = remaining(iso, now, soonMin);
  if (r.hidden && !always) return null;
  const urgent = r.tone === 'soon' || r.tone === 'now' || r.tone === 'late';
  return (
    <span
      title={new Date(iso).toLocaleString('es')}
      className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset', TONE[r.tone], urgent && r.tone !== 'later' && 'animate-pulse', className)}
    >
      <ClockIcon className="size-3" />{r.label}
    </span>
  );
}

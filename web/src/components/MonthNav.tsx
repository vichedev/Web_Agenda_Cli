import { useEffect, useRef, useState } from 'react';
import { monthKey, monthTitle, shiftMonth } from '../lib/format';
import { btn, cx } from '../lib/ui';
import { useNow } from '../lib/useNow';
import { DatePicker } from './DatePicker';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from './Icons';

/**
 * Selector de mes: anterior / siguiente y un boton central con la fecha de hoy en vivo que abre un
 * selector de fecha. Si se pasa `onPickDate`, elegir un dia lo selecciona; si no, se salta a su mes.
 */
export function MonthNav({ month, onChange, onPickDate, value }: {
  month: string; onChange: (m: string) => void; onPickDate?: (d: Date) => void; value?: Date;
}) {
  const now = useNow();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);

  const pick = (d: Date) => {
    setOpen(false);
    if (onPickDate) onPickDate(d); else onChange(monthKey(d));
  };
  const onCurrentMonth = month === monthKey(now);
  const arrow = cx(btn('secondary', 'sm'), 'w-8 px-0');

  return (
    <div ref={ref} className="relative flex items-center gap-2">
      <button className={arrow} onClick={() => onChange(shiftMonth(month, -1))} aria-label="Mes anterior"><ChevronLeftIcon className="size-4" /></button>
      <button
        type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}
        className={cx(btn('secondary', 'sm'), 'gap-1.5 tabular-nums', open && 'ring-2 ring-indigo-600', onCurrentMonth && 'text-indigo-700')}
      >
        <CalendarIcon className="size-3.5" />
        Hoy · {now.toLocaleDateString('es', { day: 'numeric', month: 'short' })}
      </button>
      <button className={arrow} onClick={() => onChange(shiftMonth(month, 1))} aria-label="Mes siguiente"><ChevronRightIcon className="size-4" /></button>
      {open && <DatePicker month={month} value={value} now={now} onPick={pick} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function MonthTitle({ month }: { month: string }) {
  return <h2 className="text-lg font-semibold tracking-tight text-slate-900">{monthTitle(month)}</h2>;
}

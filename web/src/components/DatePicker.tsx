import { useState } from 'react';
import { dayKey } from '../lib/format';
import { btn, cx } from '../lib/ui';
import { ChevronLeftIcon, ChevronRightIcon } from './Icons';

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString('es', { month: 'long' }));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Selector de fecha: calendario del mes con selector de mes y ano. Elegir un dia lo devuelve al instante.
 * `now` viene de un reloj en vivo, asi que "hoy" siempre es el dia real.
 */
export function DatePicker({ month, value, now, onPick, onClose }: {
  month: string; value?: Date; now: Date; onPick: (d: Date) => void; onClose: () => void;
}) {
  const [y0, m0] = month.split('-').map(Number);
  const [view, setView] = useState({ y: y0, m: m0 - 1 });

  const shift = (delta: number) => {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };
  const offset = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // semana inicia en lunes
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: days }, (_, i) => new Date(view.y, view.m, i + 1)),
  ];
  const today = dayKey(now);
  const years = Array.from({ length: 11 }, (_, i) => now.getFullYear() - 5 + i);
  if (!years.includes(view.y)) years.push(view.y);
  const sel = 'rounded-lg border-0 bg-slate-50 px-2 py-1.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-600 focus:outline-none';

  return (
    <div role="dialog" aria-label="Seleccionar fecha" className="animate-fade absolute top-full right-0 z-40 mt-2 w-[19rem] max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-4 shadow-xl ring-1 ring-slate-200">
      <div className="mb-3 flex items-center justify-between gap-1.5">
        <button type="button" aria-label="Mes anterior" className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={() => shift(-1)}><ChevronLeftIcon className="size-4" /></button>
        <div className="flex gap-1.5">
          <select aria-label="Mes" className={sel} value={view.m} onChange={(e) => setView({ ...view, m: Number(e.target.value) })}>
            {MONTHS.map((n, i) => <option key={n} value={i}>{cap(n)}</option>)}
          </select>
          <select aria-label="Año" className={sel} value={view.y} onChange={(e) => setView({ ...view, y: Number(e.target.value) })}>
            {years.sort().map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button type="button" aria-label="Mes siguiente" className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={() => shift(1)}><ChevronRightIcon className="size-4" /></button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((d) => <span key={d} className="pb-1 text-[11px] font-medium text-slate-400">{d}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />;
          const isToday = dayKey(d) === today;
          const isSel = value && dayKey(d) === dayKey(value);
          return (
            <button
              key={dayKey(d)} type="button" onClick={() => onPick(d)} aria-label={d.toLocaleDateString('es', { dateStyle: 'long' })} aria-current={isToday ? 'date' : undefined}
              className={cx(
                'mx-auto grid size-9 place-items-center rounded-full text-sm tabular-nums transition',
                isSel ? 'bg-indigo-600 font-semibold text-white'
                  : isToday ? 'font-semibold text-indigo-700 ring-1 ring-indigo-300 hover:bg-indigo-50'
                  : 'text-slate-700 hover:bg-slate-100',
              )}
            >{d.getDate()}</button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <p className="min-w-0 text-xs text-slate-500">
          <span className="block truncate font-medium text-slate-700">{cap(now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }))}</span>
          <span className="tabular-nums">{now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false })} · en vivo</span>
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" className={btn('secondary', 'sm')} onClick={onClose}>Cerrar</button>
          <button type="button" className={btn('primary', 'sm')} onClick={() => onPick(new Date(now.getFullYear(), now.getMonth(), now.getDate()))}>Hoy</button>
        </div>
      </div>
    </div>
  );
}


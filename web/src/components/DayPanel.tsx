import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { Support } from '../lib/api';
import { dayKey, timeOf } from '../lib/format';
import { btn, cx } from '../lib/ui';
import { useNow } from '../lib/useNow';
import { Countdown } from './Countdown';
import { PlusIcon } from './Icons';
import { SupportItem } from './SupportItem';

type Filter = 'all' | 'open' | 'closed';
const isOpen = (s: Support) => s.status === 'pending' || s.status === 'in_progress';

/**
 * Agenda del dia seleccionado: lista con scroll interno, filtros, linea "Ahora", etiqueta "Siguiente",
 * salto automatico al proximo soporte (si es hoy) y resumen fijo al pie.
 */
export function DayPanel({ date, items, focus, onAdd }: {
  date: Date; items: Support[]; focus: { id: number; n: number } | null; onAdd: () => void;
}) {
  const now = useNow(30_000);
  const scroller = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [flashId, setFlashId] = useState<number | null>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });

  const key = dayKey(date);
  const isToday = key === dayKey(now);
  const isPastDay = !isToday && date.getTime() < now.getTime();

  const sorted = useMemo(() => [...items].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)), [items]);
  const open = sorted.filter(isOpen);
  const closed = sorted.length - open.length;
  const visible = sorted.filter((s) => filter === 'all' || (filter === 'open' ? isOpen(s) : !isOpen(s)));
  // Siguiente: el primer pendiente que aun no pasa (con 15 min de gracia). Solo tiene sentido hoy.
  const next = isToday ? sorted.find((s) => s.status === 'pending' && new Date(s.scheduled_at).getTime() >= now.getTime() - 15 * 60_000) : undefined;
  // La linea "Ahora" va antes del primer soporte que todavia no empieza.
  const nowBeforeId = isToday && filter === 'all' && sorted.length > 0
    ? (sorted.find((s) => new Date(s.scheduled_at).getTime() > now.getTime())?.id ?? 'end') : null;

  const measure = () => {
    const el = scroller.current;
    if (el) setEdges({ top: el.scrollTop > 4, bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 4 });
  };
  const scrollToId = (id: number, smooth = true) => {
    const box = scroller.current;
    const el = box?.querySelector<HTMLElement>(`#support-${id}`);
    if (box && el) box.scrollTo({ top: Math.max(0, el.offsetTop - 16), behavior: smooth ? 'smooth' : 'auto' });
  };

  // Al cambiar de dia: volver al inicio, o saltar al siguiente soporte si es hoy.
  useEffect(() => {
    setFilter('all');
    const box = scroller.current;
    if (box) box.scrollTop = 0;
    if (next) window.setTimeout(() => scrollToId(next.id, false), 0);
    measure();
  }, [key, sorted.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Llegar desde un soporte del calendario: desplazarse hasta el y destacarlo.
  useEffect(() => {
    if (!focus) return;
    setFilter('all');
    const t = window.setTimeout(() => { scrollToId(focus.id); setFlashId(focus.id); }, 60);
    const off = window.setTimeout(() => setFlashId(null), 1800);
    return () => { window.clearTimeout(t); window.clearTimeout(off); };
  }, [focus?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(measure, [visible.length, filter]);

  const tabs: { id: Filter; label: string; n: number }[] = [
    { id: 'all', label: 'Todos', n: sorted.length },
    { id: 'open', label: 'Pendientes', n: open.length },
    { id: 'closed', label: 'Hechos', n: closed },
  ];
  const summary = !sorted.length ? 'Sin soportes' : [
    `${sorted.length} soporte${sorted.length > 1 ? 's' : ''}`,
    open.length ? `${open.length} pendiente${open.length > 1 ? 's' : ''}` : '',
    closed ? `${closed} hecho${closed > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <section className="flex flex-col rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80">
      <div className="flex items-start justify-between gap-3 px-5 pt-4.5 pb-3">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-slate-900 first-letter:uppercase">
            {date.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
            {isToday && <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 align-middle text-[10px] font-semibold tracking-wide text-indigo-700 uppercase">Hoy</span>}
          </h2>
          <p className="mt-0.5 text-[13px] text-slate-500">{summary}</p>
        </div>
        <button className={btn('secondary', 'sm')} onClick={onAdd}><PlusIcon className="size-3.5" />Agregar</button>
      </div>

      {sorted.length > 1 && (
        <div className="flex gap-1 px-5 pb-3" role="tablist" aria-label="Filtrar soportes del día">
          {tabs.map((t) => (
            <button
              key={t.id} type="button" role="tab" aria-selected={filter === t.id} onClick={() => setFilter(t.id)}
              className={cx('rounded-full px-3 py-1 text-xs font-medium transition', filter === t.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
            >{t.label} <span className="tabular-nums opacity-70">{t.n}</span></button>
          ))}
        </div>
      )}

      <div className="relative border-t border-slate-100">
        <div
          ref={scroller} onScroll={measure}
          className="nice-scroll relative max-h-[min(32rem,60vh)] min-h-24 space-y-3 overflow-y-auto overscroll-contain scroll-smooth px-4 py-4"
        >
          {!sorted.length && (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
              <p className="text-sm text-slate-500">{isPastDay ? 'No hay soportes registrados este día.' : 'Sin soportes para este día.'}</p>
              <button className={cx(btn('primary', 'sm'), 'mt-3')} onClick={onAdd}>
                <PlusIcon className="size-3.5" />{isPastDay ? 'Registrar un soporte realizado' : 'Agendar un soporte'}
              </button>
            </div>
          )}
          {sorted.length > 0 && !visible.length && <p className="py-6 text-center text-[13px] text-slate-400">Ningún soporte en este filtro.</p>}

          {visible.map((s) => (
            <Fragment key={s.id}>
              {nowBeforeId === s.id && <NowLine now={now} />}
              <SupportItem s={s} tag={next?.id === s.id ? 'Siguiente' : undefined} flash={flashId === s.id} />
            </Fragment>
          ))}
          {nowBeforeId === 'end' && <NowLine now={now} />}
        </div>
        <div aria-hidden="true" className={cx('pointer-events-none absolute inset-x-0 top-0 h-6 bg-linear-to-b from-white to-transparent transition-opacity', edges.top ? 'opacity-100' : 'opacity-0')} />
        <div aria-hidden="true" className={cx('pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-white to-transparent transition-opacity', edges.bottom ? 'opacity-100' : 'opacity-0')} />
      </div>

      {next && (
        <button
          type="button" onClick={() => scrollToId(next.id)}
          className="flex items-center justify-between gap-3 rounded-b-2xl border-t border-slate-100 bg-slate-50/80 px-5 py-3 text-left text-[13px] transition hover:bg-slate-100"
        >
          <span className="min-w-0 truncate text-slate-600">
            <span className="font-semibold text-slate-900">Siguiente · {timeOf(next.scheduled_at)}</span> · {next.client_name}
          </span>
          <Countdown iso={next.scheduled_at} always />
        </button>
      )}
    </section>
  );
}

function NowLine({ now }: { now: Date }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold text-indigo-600" aria-label="Hora actual">
      <span className="relative flex size-2"><i className="absolute inline-flex size-full animate-ping rounded-full bg-indigo-400 opacity-60" /><i className="relative inline-flex size-2 rounded-full bg-indigo-600" /></span>
      <span className="tabular-nums">Ahora · {timeOf(now.toISOString())}</span>
      <i className="h-px flex-1 bg-indigo-200" />
    </div>
  );
}

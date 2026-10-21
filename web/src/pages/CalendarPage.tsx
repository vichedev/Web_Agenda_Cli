import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CalendarIcon, CheckIcon, ClockIcon, PlayIcon, PlusIcon } from '../components/Icons';
import { Countdown } from '../components/Countdown';
import { DayPanel } from '../components/DayPanel';
import { Modal } from '../components/Modal';
import { MonthNav, MonthTitle } from '../components/MonthNav';
import { SupportForm } from '../components/SupportForm';
import { Card, PageHead } from '../components/ui';
import { api, type Support } from '../lib/api';
import { dayKey, monthKey, timeOf } from '../lib/format';
import { STATUS, btn, cx } from '../lib/ui';
import { useNow } from '../lib/useNow';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MAX_CHIPS = 2;
const movable = (s: Support) => s.status === 'pending' || s.status === 'in_progress';
const longDate = (d: Date) => d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });

export function CalendarPage() {
  const qc = useQueryClient();
  const now = useNow(30_000);
  const [month, setMonth] = useState(monthKey(new Date()));
  const [selected, setSelected] = useState(new Date());
  const [creating, setCreating] = useState(false);
  const [focusSupport, setFocusSupport] = useState<{ id: number; n: number } | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const keyNav = useRef(false);

  const { data = [], isLoading, error } = useQuery({ queryKey: ['supports', month], queryFn: () => api.supports(month) });
  const upcomingQ = useQuery({ queryKey: ['upcoming'], queryFn: api.upcoming, refetchInterval: 60_000, staleTime: 0 });
  const upcoming = (upcomingQ.data ?? []).slice(0, 5);

  const count = (st: Support['status']) => data.filter((s) => s.status === st).length;
  const byDay = useMemo(() => {
    const map = new Map<string, Support[]>();
    for (const s of data) {
      const k = dayKey(new Date(s.scheduled_at));
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return map;
  }, [data]);

  const [y, m] = month.split('-').map(Number);
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7; // semana inicia en lunes
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(y, m - 1, i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  const rows = cells.length / 7;
  const todayKey = dayKey(now);
  const selectedInMonth = monthKey(selected) === month;
  const selectedItems = byDay.get(dayKey(selected)) ?? [];

  const say = (text: string, isError = false) => {
    setNotice({ text, error: isError });
    window.setTimeout(() => setNotice(null), 4500);
  };

  // ---- Seleccion y teclado ----
  const pick = (d: Date) => {
    setSelected(d);
    setCreating(false);
    if (monthKey(d) !== month) setMonth(monthKey(d));
  };
  const moveTo = (d: Date) => { keyNav.current = true; pick(d); };
  const shiftDays = (n: number) => { const d = new Date(selected); d.setDate(d.getDate() + n); moveTo(d); };
  const shiftMonths = (n: number) => {
    const d = new Date(selected.getFullYear(), selected.getMonth() + n, 1);
    d.setDate(Math.min(selected.getDate(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    moveTo(d);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const dow = (selected.getDay() + 6) % 7;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => shiftDays(-1), ArrowRight: () => shiftDays(1), ArrowUp: () => shiftDays(-7), ArrowDown: () => shiftDays(7),
      Home: () => shiftDays(-dow), End: () => shiftDays(6 - dow),
      PageUp: () => shiftMonths(-1), PageDown: () => shiftMonths(1),
      t: () => moveTo(new Date()), T: () => moveTo(new Date()),
      a: () => setCreating(true), A: () => setCreating(true), '+': () => setCreating(true),
    };
    const run = actions[e.key];
    if (run) { e.preventDefault(); run(); }
  };
  // Tras moverse con el teclado, el foco sigue al dia seleccionado.
  useEffect(() => {
    if (!keyNav.current) return;
    keyNav.current = false;
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>(`[data-day="${dayKey(selected)}"]`)?.focus());
  }, [selected, month, data]);

  // ---- Arrastrar un soporte a otro dia para reprogramarlo (conserva la hora) ----
  const reschedule = useMutation({
    mutationFn: ({ id, scheduledAt }: { id: number; scheduledAt: string }) => api.updateSupport(id, { scheduledAt }),
    onSuccess: (s) => { qc.invalidateQueries(); say(`Reprogramado: ${s.title} → ${longDate(new Date(s.scheduled_at))}, ${timeOf(s.scheduled_at)}`); },
    onError: (e) => say(e.message, true),
  });
  const drop = (day: Date) => {
    const s = data.find((x) => x.id === dragId);
    setDragId(null); setDragOver(null);
    if (!s) return;
    const old = new Date(s.scheduled_at);
    if (dayKey(old) === dayKey(day)) return;
    reschedule.mutate({ id: s.id, scheduledAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), old.getHours(), old.getMinutes()).toISOString() });
    pick(day);
  };

  const kpis = [
    { label: 'Soportes del mes', n: data.length, icon: CalendarIcon, tone: 'bg-indigo-50 text-indigo-600' },
    { label: 'Pendientes', n: count('pending'), icon: ClockIcon, tone: STATUS.pending.bubble },
    { label: 'En progreso', n: count('in_progress'), icon: PlayIcon, tone: STATUS.in_progress.bubble },
    { label: 'Completados', n: count('completed'), icon: CheckIcon, tone: STATUS.completed.bubble },
  ];
  const pct = data.length ? Math.round((count('completed') / data.length) * 100) : 0;

  return (
    <>
      <PageHead title="Calendario" subtitle="Organice los soportes y dé seguimiento a su progreso.">
        <button className={btn()} onClick={() => { pick(new Date()); setCreating(true); }}>
          <PlusIcon className="size-4" />Nuevo soporte
        </button>
      </PageHead>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {kpis.map(({ label, n, icon: Icon, tone }) => (
          <div key={label} className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
            <span className={cx('grid size-11 shrink-0 place-items-center rounded-xl', tone)}><Icon className="size-5.5" /></span>
            <div>
              <p className="text-3xl leading-none font-semibold tracking-tight tabular-nums text-slate-900">{n}</p>
              <p className="mt-1.5 text-[13px] text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-4">
              <MonthTitle month={month} />
              {data.length > 0 && (
                <span className="hidden items-center gap-2 text-[13px] text-slate-500 sm:flex">
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><i className="block h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} /></span>
                  {pct}% completado
                </span>
              )}
            </div>
            <MonthNav month={month} onChange={setMonth} value={selected} onPickDate={pick} />
          </div>

          {error && <p className="px-5 pt-3 text-[13px] text-rose-600">{error.message}</p>}
          {notice && (
            <p role="status" className={cx('animate-fade mx-5 mt-3 rounded-lg px-3.5 py-2 text-[13px] ring-1', notice.error ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200')}>{notice.text}</p>
          )}

          <div className={cx('@container p-2 transition-opacity sm:p-3', isLoading && 'opacity-50')}>
            <div className="mb-1 grid grid-cols-7" aria-hidden="true">
              {WEEKDAYS.map((d) => <div key={d} className="py-2 text-center text-xs font-medium tracking-wide text-slate-400 uppercase">{d}</div>)}
            </div>
            <div ref={gridRef} role="grid" aria-label="Calendario de soportes" onKeyDown={onKeyDown} className="grid grid-cols-7 gap-1.5">
              {cells.map((d, i) => {
                if (!d) return <div key={`e${i}`} className="min-h-14 @2xl:min-h-26" />;
                const k = dayKey(d);
                const items = byDay.get(k) ?? [];
                const isToday = k === todayKey;
                const isSel = k === dayKey(selected);
                const tab = isSel || (!selectedInMonth && d.getDate() === 1);
                const above = Math.floor(i / 7) >= rows - 2;
                const dropTarget = dragOver === k;
                return (
                  <div
                    key={k} role="gridcell" tabIndex={tab ? 0 : -1} data-day={k} aria-selected={isSel}
                    aria-label={`${longDate(d)}${items.length ? `, ${items.length} soporte${items.length > 1 ? 's' : ''}` : ''}`}
                    onClick={() => pick(d)}
                    onDoubleClick={() => { pick(d); setCreating(true); }}
                    onDragOver={(e) => { if (dragId == null) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOver !== k) setDragOver(k); }}
                    onDragLeave={() => { if (dragOver === k) setDragOver(null); }}
                    onDrop={(e) => { e.preventDefault(); drop(d); }}
                    className={cx(
                      'group relative flex min-h-14 min-w-0 cursor-pointer flex-col items-stretch gap-1 rounded-xl p-1 text-left transition select-none focus-visible:z-10 @md:p-1.5 @2xl:min-h-26 @2xl:p-2',
                      dropTarget ? 'bg-emerald-50 ring-2 ring-emerald-400'
                        : isSel ? 'bg-indigo-50 ring-2 ring-indigo-500'
                        : 'ring-1 ring-slate-100 hover:bg-slate-50 hover:ring-slate-300',
                    )}
                  >
                    <span className={cx('grid size-6 place-items-center rounded-full text-xs font-medium tabular-nums @md:size-6.5 @md:text-[13px]', isToday ? 'bg-indigo-600 text-white' : 'text-slate-700')}>
                      {d.getDate()}
                    </span>

                    {items.slice(0, MAX_CHIPS).map((s) => (
                      <span
                        key={s.id} draggable={movable(s)}
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(s.id)); e.dataTransfer.effectAllowed = 'move'; setDragId(s.id); }}
                        onDragEnd={() => { setDragId(null); setDragOver(null); }}
                        onClick={(e) => { e.stopPropagation(); pick(d); setFocusSupport({ id: s.id, n: Date.now() }); }}
                        className={cx(
                          'hidden truncate rounded-md px-1.5 py-0.5 text-[11px] leading-snug font-medium transition hover:brightness-95 @2xl:block',
                          STATUS[s.status].chip, movable(s) && 'cursor-grab active:cursor-grabbing', dragId === s.id && 'opacity-40',
                        )}
                      >
                        <span className="tabular-nums opacity-70">{timeOf(s.scheduled_at)}</span> {s.client_name}
                      </span>
                    ))}
                    {items.length > MAX_CHIPS && <span className="hidden pl-1 text-[11px] font-medium text-slate-400 @2xl:block">+{items.length - MAX_CHIPS} más</span>}
                    {items.length > 0 && (
                      <span className="flex flex-wrap gap-1 px-0.5 @2xl:hidden">
                        {items.slice(0, 4).map((s) => <i key={s.id} className={cx('size-1.5 rounded-full', STATUS[s.status].dot)} />)}
                      </span>
                    )}

                    {/* Vista previa al pasar el cursor (solo dispositivos con mouse) */}
                    {items.length > 0 && dragId == null && (
                      <span
                        role="presentation"
                        className={cx(
                          'pointer-events-none invisible absolute z-30 w-60 rounded-xl bg-white p-3 text-left opacity-0 shadow-xl ring-1 ring-slate-200 transition group-hover:visible group-hover:opacity-100 group-hover:delay-500',
                          above ? 'bottom-full mb-1.5' : 'top-full mt-1.5', i % 7 >= 4 ? 'right-0' : 'left-0',
                        )}
                      >
                        <span className="mb-1.5 block text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{longDate(d)}</span>
                        {items.slice(0, 5).map((s) => (
                          <span key={s.id} className="flex items-center gap-2 py-0.5 text-[12px] text-slate-700">
                            <i className={cx('size-1.5 shrink-0 rounded-full', STATUS[s.status].dot)} />
                            <span className="tabular-nums text-slate-500">{timeOf(s.scheduled_at)}</span>
                            <span className="truncate font-medium">{s.client_name}</span>
                          </span>
                        ))}
                        {items.length > 5 && <span className="mt-1 block text-[11px] text-slate-400">+{items.length - 5} más</span>}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            {(['pending', 'in_progress', 'completed'] as const).map((st) => (
              <span key={st} className="inline-flex items-center gap-1.5"><i className={cx('size-2 rounded-full', STATUS[st].dot)} />{STATUS[st].label}</span>
            ))}
            <span className="ml-auto hidden text-slate-400 md:inline">
              Doble clic: agregar · Arrastre un soporte a otro día para reprogramarlo · Teclado: flechas, T hoy, A agregar
            </span>
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <DayPanel date={selected} items={selectedItems} focus={focusSupport} onAdd={() => setCreating(true)} />

          {upcoming.length > 0 && (
            <Card title="Próximos soportes" description="Pendientes cercanos, con cuenta regresiva">
              <ul className="divide-y divide-slate-100">
                {upcoming.map((s) => (
                  <li key={s.id}>
                    <button
                      className="flex w-full items-center gap-3.5 px-5 py-3 text-left transition hover:bg-slate-50"
                      onClick={() => { pick(new Date(s.scheduled_at)); setFocusSupport({ id: s.id, n: Date.now() }); }}
                    >
                      <span className="w-12 shrink-0 rounded-lg bg-slate-100 py-1 text-center">
                        <b className="block text-sm leading-tight font-semibold text-slate-900">{new Date(s.scheduled_at).getDate()}</b>
                        <span className="block text-[10px] font-medium text-slate-500 uppercase">{new Date(s.scheduled_at).toLocaleDateString('es', { month: 'short' })}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-900">{s.title}</span>
                        <span className="block truncate text-[13px] text-slate-500">{s.client_name}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-[13px] font-medium tabular-nums text-slate-500">{timeOf(s.scheduled_at)}</span>
                        <Countdown iso={s.scheduled_at} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo soporte" description={<span className="first-letter:uppercase">{longDate(selected)}</span>}>
        <SupportForm bare date={selected} onDone={() => setCreating(false)} />
      </Modal>
    </>
  );
}

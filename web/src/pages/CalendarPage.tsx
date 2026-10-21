import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { CalendarIcon, CheckIcon, ClockIcon, PlayIcon, PlusIcon } from '../components/Icons';
import { Countdown } from '../components/Countdown';
import { MonthNav, MonthTitle } from '../components/MonthNav';
import { SupportForm } from '../components/SupportForm';
import { SupportItem } from '../components/SupportItem';
import { Card, EmptyState, PageHead } from '../components/ui';
import { api, type Support } from '../lib/api';
import { dayKey, monthKey, timeOf } from '../lib/format';
import { STATUS, btn, cx } from '../lib/ui';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MAX_CHIPS = 2;

export function CalendarPage() {
  const [month, setMonth] = useState(monthKey(new Date()));
  const [selected, setSelected] = useState(new Date());
  const [creating, setCreating] = useState(false);
  const { data = [], isLoading, error } = useQuery({ queryKey: ['supports', month], queryFn: () => api.supports(month) });

  const count = (st: Support['status']) => data.filter((s) => s.status === st).length;
  const byDay = useMemo(() => {
    const map = new Map<string, Support[]>();
    for (const s of data) {
      const k = dayKey(new Date(s.scheduled_at));
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return map;
  }, [data]);
  // Proximos (y atrasados) pendientes: se actualiza en tiempo real y cada minuto.
  const upcomingQ = useQuery({ queryKey: ['upcoming'], queryFn: api.upcoming, refetchInterval: 60_000, staleTime: 0 });
  const upcoming = (upcomingQ.data ?? []).slice(0, 5);

  const [y, m] = month.split('-').map(Number);
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7; // semana inicia en lunes
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(y, m - 1, i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  const todayKey = dayKey(new Date());
  const selectedItems = byDay.get(dayKey(selected)) ?? [];

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
        <button className={btn()} onClick={() => { setSelected(new Date()); setCreating(true); }}>
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
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><i className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></span>
                  {pct}% completado
                </span>
              )}
            </div>
            <MonthNav month={month} onChange={setMonth} value={selected} onPickDate={(d) => { setSelected(d); setMonth(monthKey(d)); setCreating(false); }} />
          </div>

          {error && <p className="px-5 pt-3 text-[13px] text-rose-600">{error.message}</p>}
          <div className={cx('@container p-2 transition-opacity sm:p-3', isLoading && 'opacity-50')}>
            <div className="mb-1 grid grid-cols-7">
              {WEEKDAYS.map((d) => <div key={d} className="py-2 text-center text-xs font-medium tracking-wide text-slate-400 uppercase">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {cells.map((d, i) => {
                if (!d) return <div key={`e${i}`} className="min-h-14 @2xl:min-h-26" />;
                const items = byDay.get(dayKey(d)) ?? [];
                const isToday = dayKey(d) === todayKey;
                const isSel = dayKey(d) === dayKey(selected);
                return (
                  <button
                    key={dayKey(d)} onClick={() => { setSelected(d); setCreating(false); }}
                    className={cx(
                      'flex min-h-14 min-w-0 flex-col items-stretch gap-1 rounded-xl p-1 text-left transition @md:p-1.5 @2xl:min-h-26 @2xl:p-2',
                      isSel ? 'bg-indigo-50 ring-2 ring-indigo-500' : 'ring-1 ring-slate-100 hover:bg-slate-50 hover:ring-slate-200',
                    )}
                  >
                    <span className={cx('grid size-6 place-items-center rounded-full text-xs font-medium tabular-nums @md:size-6.5 @md:text-[13px]', isToday ? 'bg-indigo-600 text-white' : 'text-slate-700')}>
                      {d.getDate()}
                    </span>
                    {items.slice(0, MAX_CHIPS).map((s) => (
                      <span key={s.id} title={`${s.client_name} · ${STATUS[s.status].label}`}
                        className={cx('hidden truncate rounded-md px-1.5 py-0.5 text-[11px] leading-snug font-medium @2xl:block', STATUS[s.status].chip)}>
                        <span className="tabular-nums opacity-70">{timeOf(s.scheduled_at)}</span> {s.client_name}
                      </span>
                    ))}
                    {items.length > MAX_CHIPS && <span className="hidden pl-1 text-[11px] font-medium text-slate-400 @2xl:block">+{items.length - MAX_CHIPS} más</span>}
                    {items.length > 0 && (
                      <span className="flex flex-wrap gap-1 px-0.5 @2xl:hidden">
                        {items.slice(0, 4).map((s) => <i key={s.id} className={cx('size-1.5 rounded-full', STATUS[s.status].dot)} />)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <Card
            title={selected.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
            description={selectedItems.length ? `${selectedItems.length} soporte${selectedItems.length > 1 ? 's' : ''} agendado${selectedItems.length > 1 ? 's' : ''}` : 'Agenda del día'}
            action={!creating && <button className={btn('secondary', 'sm')} onClick={() => setCreating(true)}><PlusIcon className="size-3.5" />Agregar</button>}
          >
            <div className="space-y-3 p-5">
              {creating && <SupportForm date={selected} onDone={() => setCreating(false)} />}
              {!selectedItems.length && !creating && <EmptyState>Sin soportes para este día.</EmptyState>}
              {selectedItems.map((s) => <SupportItem key={s.id} s={s} />)}
            </div>
          </Card>

          {upcoming.length > 0 && (
            <Card title="Próximos soportes" description="Pendientes cercanos, con cuenta regresiva">
              <ul className="divide-y divide-slate-100">
                {upcoming.map((s) => (
                  <li key={s.id}>
                    <button className="flex w-full items-center gap-3.5 px-5 py-3 text-left transition hover:bg-slate-50" onClick={() => { setSelected(new Date(s.scheduled_at)); setCreating(false); }}>
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
    </>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ClientForm } from '../components/ClientForm';
import { ChevronRightIcon, PencilIcon, PlusIcon } from '../components/Icons';
import { MonthNav, MonthTitle } from '../components/MonthNav';
import { SupportForm } from '../components/SupportForm';
import { SupportItem } from '../components/SupportItem';
import { Avatar, Card, EmptyState } from '../components/ui';
import { api } from '../lib/api';
import { initials, monthKey, monthTitle } from '../lib/format';
import { btn, cx } from '../lib/ui';

export function ClientDetailPage() {
  const id = Number(useParams().id);
  const nav = useNavigate();
  const qc = useQueryClient();
  const [month, setMonth] = useState(monthKey(new Date()));
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);

  const client = useQuery({ queryKey: ['client', id], queryFn: () => api.client(id) });
  const history = useQuery({ queryKey: ['history', id, month], queryFn: () => api.clientHistory(id, month) });
  const months = useQuery({ queryKey: ['history-months', id], queryFn: () => api.clientMonths(id) });
  const remove = useMutation({
    mutationFn: () => api.deleteClient(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); nav('/clients'); },
  });

  if (client.isLoading) return <p className="text-slate-500">Cargando…</p>;
  if (!client.data) return <p className="text-rose-600">Cliente no encontrado. <Link to="/clients" className="underline">Volver</Link></p>;
  const c = client.data;
  const total = months.data?.reduce((a, m) => a + m.total, 0) ?? 0;
  const done = months.data?.reduce((a, m) => a + m.completed, 0) ?? 0;
  const info: [string, string | null][] = [['Correo', c.email], ['Dirección', c.address]];

  return (
    <>
      <nav className="mb-5 flex min-w-0 items-center gap-1.5 text-[13px] text-slate-500" aria-label="Ruta">
        <Link to="/clients" className="font-medium transition hover:text-slate-900">Clientes</Link>
        <ChevronRightIcon className="size-3.5 shrink-0" />
        <span className="truncate text-slate-900">{c.name}</span>
      </nav>

      <Card className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-4 p-5 sm:p-6">
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            <Avatar name={c.name} text={initials(c.name)} size="lg" />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight break-words text-slate-900 sm:text-2xl">{c.name}</h1>
              <p className="text-slate-500">{c.company || 'Sin empresa'}</p>
            </div>
          </div>
          <div className="flex w-full flex-wrap gap-2.5 sm:w-auto">
            <button className={btn()} onClick={() => { setCreating(true); setEditing(false); }}><PlusIcon className="size-4" />Nuevo soporte</button>
            <button className={btn('secondary')} onClick={() => { setEditing(!editing); setCreating(false); }}><PencilIcon className="size-4" />{editing ? 'Cerrar edición' : 'Editar'}</button>
            <button className={btn('danger')} onClick={() => confirm('¿Dar de baja a este cliente? El historial se conserva y puede volver a registrarlo con el mismo número.') && remove.mutate()}>Dar de baja</button>
          </div>
        </div>

        {editing ? (
          <div className="animate-fade border-t border-slate-100"><ClientForm client={c} onDone={() => setEditing(false)} /></div>
        ) : (
          <>
            <dl className="grid divide-y divide-slate-100 border-t border-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              {info.map(([k, v]) => (
                <div key={k} className="min-w-0 px-5 py-4 sm:px-6">
                  <dt className="text-xs font-medium tracking-wide text-slate-400 uppercase">{k}</dt>
                  <dd className="mt-1 font-medium break-words text-slate-800">{v || '—'}</dd>
                </div>
              ))}
            </dl>
            {c.notes && <p className="border-t border-slate-100 px-5 py-4 break-words text-slate-600 sm:px-6">{c.notes}</p>}
          </>
        )}
      </Card>

      {creating && <div className="mb-6"><SupportForm date={new Date()} clientId={id} onDone={() => setCreating(false)} /></div>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card title="Historial de soportes" action={<MonthNav month={month} onChange={setMonth} />}>
          <div className="space-y-3 p-4 sm:p-5">
            <MonthTitle month={month} />
            {history.data?.length === 0 && <EmptyState>Sin soportes en {monthTitle(month)}.</EmptyState>}
            {history.data?.map((s) => <SupportItem key={s.id} s={s} showClient={false} full />)}
          </div>
        </Card>

        <Card title="Actividad por mes" description={`${done} de ${total} soportes completados`}>
          {months.data?.length === 0 && <p className="p-5 text-[13px] text-slate-500">Aún no hay historial.</p>}
          <ul className="divide-y divide-slate-100">
            {months.data?.map((m) => (
              <li key={m.month}>
                <button
                  onClick={() => setMonth(m.month)}
                  className={cx('block w-full px-5 py-3.5 text-left transition hover:bg-slate-50', m.month === month && 'bg-indigo-50/60')}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cx('font-medium', m.month === month ? 'text-indigo-700' : 'text-slate-800')}>{monthTitle(m.month)}</span>
                    <span className="text-[13px] tabular-nums text-slate-500">{m.completed}/{m.total}</span>
                  </span>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <i className="block h-full rounded-full bg-emerald-500" style={{ width: `${m.total ? (m.completed / m.total) * 100 : 0}%` }} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

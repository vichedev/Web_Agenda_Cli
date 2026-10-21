import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ClientForm } from '../components/ClientForm';
import { ChevronRightIcon, PlusIcon, SearchIcon } from '../components/Icons';
import { Avatar, Card, EmptyState, PageHead } from '../components/ui';
import { api } from '../lib/api';
import { initials } from '../lib/format';
import { btn, cx, input } from '../lib/ui';

const th = 'px-4 py-3 text-left text-xs font-medium tracking-wide text-slate-500 uppercase sm:px-6';

export function ClientsPage() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const clients = useQuery({ queryKey: ['clients', q], queryFn: () => api.clients(q) });
  const list = clients.data ?? [];

  return (
    <>
      <PageHead
        title="Clientes"
        subtitle={clients.isLoading ? 'Cargando…' : `${list.length} cliente${list.length === 1 ? '' : 's'}${q ? ' encontrado' + (list.length === 1 ? '' : 's') : ' registrado' + (list.length === 1 ? '' : 's')}`}
      >
        <button className={btn()} onClick={() => setOpen(!open)}>
          {open ? 'Cerrar' : <><PlusIcon className="size-4" />Nuevo cliente</>}
        </button>
      </PageHead>

      {open && (
        <Card title="Nuevo cliente" description="Solo el nombre es obligatorio. Estos datos son para su consulta; el cliente no tiene acceso." className="animate-fade mb-6">
          <ClientForm onDone={() => setOpen(false)} />
        </Card>
      )}

      <div className="relative mb-5 w-full max-w-sm">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
        <input
          className={cx(input, 'pl-9')} placeholder="Buscar por nombre o empresa" aria-label="Buscar clientes"
          value={q} onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {clients.error && <p className="mb-4 rounded-lg bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700 ring-1 ring-rose-200">{clients.error.message}</p>}

      {clients.isLoading ? (
        <Card className="divide-y divide-slate-100">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex animate-pulse items-center gap-3.5 px-6 py-4">
              <span className="size-10 rounded-full bg-slate-100" />
              <span className="space-y-2"><i className="block h-3 w-40 rounded bg-slate-100" /><i className="block h-2.5 w-24 rounded bg-slate-100" /></span>
            </div>
          ))}
        </Card>
      ) : list.length === 0 ? (
        <EmptyState>{q ? 'Ningún cliente coincide con la búsqueda.' : 'Aún no hay clientes. Cree el primero con el botón superior.'}</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full table-fixed sm:table-auto">
            <thead className="border-b border-slate-100 bg-slate-50/70">
              <tr>
                <th className={th}>Cliente</th>
                <th className={cx(th, 'hidden sm:table-cell')}>Correo</th>
                <th className={cx(th, 'w-24 text-center')}>Soportes</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((c) => (
                <tr key={c.id} onClick={() => nav(`/clients/${c.id}`)} className="group cursor-pointer transition hover:bg-slate-50">
                  <td className="px-4 py-3.5 sm:px-6">
                    <Link to={`/clients/${c.id}`} onClick={(e) => e.stopPropagation()} className="flex min-w-0 items-center gap-3.5">
                      <Avatar name={c.name} text={initials(c.name)} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-slate-900">{c.name}</span>
                        <span className="block truncate text-[13px] text-slate-500">{c.company || 'Sin empresa'}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="hidden max-w-56 truncate px-4 py-3.5 text-slate-600 sm:table-cell sm:px-6">{c.email || '—'}</td>
                  <td className="px-2 py-3.5 text-center">
                    <span className="inline-flex min-w-7 justify-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700">{c.supports_count ?? 0}</span>
                  </td>
                  <td className="pr-3"><ChevronRightIcon className="size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

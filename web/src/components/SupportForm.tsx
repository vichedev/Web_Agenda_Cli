import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { toLocalInput } from '../lib/format';
import { btn, cx, field, input } from '../lib/ui';

export function SupportForm({ date, clientId, onDone, bare = false }: { date: Date; clientId?: number; onDone: () => void; bare?: boolean }) {
  const qc = useQueryClient();
  const clients = useQuery({ queryKey: ['clients', ''], queryFn: () => api.clients() });
  const initial = new Date(date);
  if (initial.getHours() === 0) initial.setHours(9, 0, 0, 0);

  const [client, setClient] = useState<number | ''>(clientId ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [when, setWhen] = useState(toLocalInput(initial));
  const [duration, setDuration] = useState(60);
  // "Ya se realizo": registra un soporte pasado como completado. Se sugiere solo si la fecha ya paso.
  const [done, setDone] = useState(initial.getTime() < Date.now());
  const [touched, setTouched] = useState(false);
  const isPast = new Date(when).getTime() < Date.now();
  const completed = done && isPast;

  const create = useMutation({
    mutationFn: () => api.createSupport({
      clientId: Number(client), title, description,
      scheduledAt: new Date(when).toISOString(), durationMin: duration,
      status: completed ? 'completed' : 'pending',
    }),
    onSuccess: () => { qc.invalidateQueries(); onDone(); },
  });

  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate(); };

  return (
    <form className={bare ? 'flex flex-col' : 'animate-fade flex flex-col rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200'} onSubmit={submit}>
      {!bare && <h3 className="mb-4 text-sm font-semibold text-slate-900">{completed ? 'Registrar soporte realizado' : 'Nuevo soporte'}</h3>}
      <label className={field}>Cliente
        <select className={input} required value={client} onChange={(e) => setClient(Number(e.target.value))} disabled={clientId !== undefined}>
          <option value="" disabled>Seleccione un cliente…</option>
          {clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className={field}>Asunto<input className={input} required placeholder="Ej. Impresora sin conexión" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className={field}>Descripción
        <textarea className={input} rows={3} required placeholder="¿Qué hay que hacer o qué falla?" value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-3">
        <label className={cx(field, 'min-w-44 flex-1')}>Fecha y hora<input className={input} type="datetime-local" required value={when} onChange={(e) => { setWhen(e.target.value); if (!touched) setDone(new Date(e.target.value).getTime() < Date.now()); }} /></label>
        <label className={cx(field, 'w-28')}>Duración (min)<input className={input} type="number" min={15} step={15} value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></label>
      </div>
      <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-lg bg-white p-3 ring-1 ring-slate-200">
        <input type="checkbox" className="mt-0.5 size-4 accent-indigo-600" checked={done} onChange={(e) => { setDone(e.target.checked); setTouched(true); }} />
        <span className="text-[13px] text-slate-600">
          <b className="font-semibold text-slate-900">Ya se realizó</b>
          <span className="block">Se guarda como completado en la fecha y hora indicadas. Sirve para anotar soportes que ya hizo.</span>
        </span>
      </label>
      {isPast && !done && <p className="-mt-2 mb-4 text-[13px] text-amber-700">La fecha ya pasó: quedará como pendiente atrasado. Márquelo como realizado si ya lo hizo.</p>}
      {done && !isPast && <p className="-mt-2 mb-4 text-[13px] text-amber-700">La fecha es futura: no puede estar realizado todavía, se agendará como pendiente.</p>}
      {create.error && <p className="mb-3 text-[13px] text-rose-600">{create.error.message}</p>}
      <div className="flex gap-2.5">
        <button type="submit" className={btn()} disabled={create.isPending}>{create.isPending ? 'Guardando…' : completed ? 'Registrar soporte' : 'Agendar soporte'}</button>
        <button type="button" className={btn('secondary')} onClick={onDone}>Cancelar</button>
      </div>
    </form>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { toLocalInput } from '../lib/format';
import { btn, cx, field, input } from '../lib/ui';

export function SupportForm({ date, clientId, onDone }: { date: Date; clientId?: number; onDone: () => void }) {
  const qc = useQueryClient();
  const clients = useQuery({ queryKey: ['clients', ''], queryFn: () => api.clients() });
  const initial = new Date(date);
  if (initial.getHours() === 0) initial.setHours(9, 0, 0, 0);

  const [client, setClient] = useState<number | ''>(clientId ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [when, setWhen] = useState(toLocalInput(initial));
  const [duration, setDuration] = useState(60);

  const create = useMutation({
    mutationFn: () => api.createSupport({
      clientId: Number(client), title, description,
      scheduledAt: new Date(when).toISOString(), durationMin: duration,
    }),
    onSuccess: () => { qc.invalidateQueries(); onDone(); },
  });

  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate(); };

  return (
    <form className="animate-fade flex flex-col rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200" onSubmit={submit}>
      <h3 className="mb-4 text-sm font-semibold text-slate-900">Nuevo soporte</h3>
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
        <label className={cx(field, 'min-w-44 flex-1')}>Fecha y hora<input className={input} type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} /></label>
        <label className={cx(field, 'w-28')}>Duración (min)<input className={input} type="number" min={15} step={15} value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></label>
      </div>
      {create.error && <p className="mb-3 text-[13px] text-rose-600">{create.error.message}</p>}
      <div className="flex gap-2.5">
        <button type="submit" className={btn()} disabled={create.isPending}>{create.isPending ? 'Agendando…' : 'Agendar soporte'}</button>
        <button type="button" className={btn('secondary')} onClick={onDone}>Cancelar</button>
      </div>
    </form>
  );
}

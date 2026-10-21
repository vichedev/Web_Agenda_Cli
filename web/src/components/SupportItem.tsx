import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, type Status, type Support } from '../lib/api';
import { timeOf, toLocalInput } from '../lib/format';
import { STATUS, btn, cx, field, input } from '../lib/ui';
import { Countdown } from './Countdown';
import { ChatIcon, PencilIcon, TrashIcon } from './Icons';
import { StatusMenu } from './StatusMenu';

const iconBtn = 'rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700';

/** Soporte: hora, barra de color por estado, descripcion, cambio de estado y edicion. */
export function SupportItem({ s, showClient = true, full = false }: { s: Support; showClient?: boolean; full?: boolean }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries();
  const setStatus = useMutation({ mutationFn: (st: Status) => api.setStatus(s.id, st), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => api.deleteSupport(s.id), onSuccess: refresh });

  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(s.title);
  const [description, setDescription] = useState(s.description ?? '');
  const [when, setWhen] = useState('');
  const [duration, setDuration] = useState(s.duration_min);
  const update = useMutation({
    mutationFn: () => api.updateSupport(s.id, { title, description, scheduledAt: new Date(when).toISOString(), durationMin: duration }),
    onSuccess: () => { refresh(); setEditing(false); },
  });
  const startEdit = () => {
    setTitle(s.title); setDescription(s.description ?? ''); setDuration(s.duration_min);
    setWhen(toLocalInput(new Date(s.scheduled_at)));
    setEditing(true);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); update.mutate(); };
  const d = new Date(s.scheduled_at);

  if (editing) {
    return (
      <form onSubmit={submit} className="animate-fade rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
        <h4 className="mb-3.5 text-sm font-semibold text-slate-900">Editar soporte</h4>
        <label className={field}>Asunto<input className={input} required value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className={field}>Descripción
          <textarea className={input} rows={3} required placeholder="¿Qué hay que hacer o qué falla?" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-3">
          <label className={cx(field, 'min-w-44 flex-1')}>Fecha y hora<input className={input} type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} /></label>
          <label className={cx(field, 'w-28')}>Duración (min)<input className={input} type="number" min={15} step={15} value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></label>
        </div>
        {update.error && <p className="mb-3 text-[13px] text-rose-600">{update.error.message}</p>}
        <div className="flex gap-2.5">
          <button type="submit" className={btn()} disabled={update.isPending}>Guardar</button>
          <button type="button" className={btn('secondary')} onClick={() => setEditing(false)}>Cancelar</button>
        </div>
      </form>
    );
  }

  return (
    <article className={cx('animate-fade relative flex gap-3 rounded-xl bg-white p-3.5 ring-1 ring-slate-200 transition hover:ring-slate-300 sm:gap-3.5', menuOpen && 'z-30')}>
      <div className="w-12 shrink-0 text-center sm:w-14">
        <div className="text-[15px] font-semibold tabular-nums text-slate-900">{full ? d.getDate() : timeOf(s.scheduled_at)}</div>
        <div className="mt-0.5 text-xs leading-tight text-slate-400">
          {full ? <>{d.toLocaleDateString('es', { month: 'short' })}<br />{timeOf(s.scheduled_at)}</> : `${s.duration_min} min`}
        </div>
      </div>
      <i className={cx('w-1 shrink-0 self-stretch rounded-full', STATUS[s.status].bar)} aria-hidden="true" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h4 className="min-w-0 font-semibold break-words text-slate-900">{s.title}</h4>
          {s.status === 'pending' && <Countdown iso={s.scheduled_at} />}
          {s.source === 'whatsapp' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">
              <ChatIcon className="size-3" />WhatsApp
            </span>
          )}
        </div>
        {showClient && <p className="text-[13px] text-slate-500">{s.client_name}</p>}

        <p className={cx(
          'mt-2 rounded-lg px-3 py-2 text-[13px] leading-relaxed break-words',
          s.description ? 'bg-slate-50 text-slate-600' : 'border border-dashed border-slate-300 text-slate-400 italic',
        )}>
          {s.description || 'Sin descripción. Pulse el lápiz para agregarla.'}
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <StatusMenu status={s.status} disabled={setStatus.isPending} onChange={(st) => setStatus.mutate(st)} onOpenChange={setMenuOpen} />
          <div className="flex items-center">
            <button type="button" aria-label="Editar soporte" title="Editar" className={iconBtn} onClick={startEdit}><PencilIcon className="size-4" /></button>
            <button
              type="button" aria-label="Eliminar soporte" title="Eliminar" className={cx(iconBtn, 'hover:bg-rose-50 hover:text-rose-600')}
              onClick={() => confirm('¿Eliminar este soporte?') && remove.mutate()}
            ><TrashIcon className="size-4" /></button>
          </div>
        </div>
      </div>
    </article>
  );
}

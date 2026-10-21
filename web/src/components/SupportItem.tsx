import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, type Status, type Support } from '../lib/api';
import { timeOf, toLocalInput } from '../lib/format';
import { STATUS, btn, cx, field, input } from '../lib/ui';
import { Countdown } from './Countdown';
import { ChatIcon, PencilIcon, TrashIcon } from './Icons';
import { Modal, useConfirm } from './Modal';
import { StatusMenu } from './StatusMenu';

const iconBtn = 'rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700';

/**
 * Soporte: hora, barra de color por estado, descripcion, cambio de estado, edicion (modal) y eliminacion (con confirmacion).
 * `tag` muestra una etiqueta (p. ej. "Siguiente") y `flash` hace un destello al llegar a la tarjeta desde otro lugar.
 */
export function SupportItem({ s, showClient = true, full = false, tag, flash = false }: {
  s: Support; showClient?: boolean; full?: boolean; tag?: string; flash?: boolean;
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
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
    update.reset();
    setEditing(true);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); update.mutate(); };
  const ask = async () => {
    const ok = await confirm({
      title: 'Eliminar soporte',
      message: <>Se eliminará <b className="font-semibold text-slate-700">{s.title}</b>{showClient && <> de {s.client_name}</>}. Esta acción no se puede deshacer.</>,
      confirmText: 'Eliminar', tone: 'danger',
    });
    if (ok) remove.mutate();
  };
  const d = new Date(s.scheduled_at);

  return (
    <>
      <article
        id={`support-${s.id}`}
        className={cx(
          'animate-fade relative flex gap-3 rounded-xl bg-white p-3.5 ring-1 ring-slate-200 transition hover:ring-slate-300 sm:gap-3.5',
          menuOpen && 'z-30', flash && 'animate-flash ring-indigo-400',
        )}
      >
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
            {tag && <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">{tag}</span>}
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
              <button type="button" aria-label="Eliminar soporte" title="Eliminar" className={cx(iconBtn, 'hover:bg-rose-50 hover:text-rose-600')} onClick={ask}>
                <TrashIcon className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </article>

      <Modal open={editing} onClose={() => setEditing(false)} title="Editar soporte" description={showClient ? `Cliente: ${s.client_name}` : undefined}>
        <form onSubmit={submit} className="flex flex-col">
          <label className={field}>Asunto<input className={input} required value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className={field}>Descripción
            <textarea className={input} rows={3} required placeholder="¿Qué hay que hacer o qué falla?" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className={cx(field, 'min-w-44 flex-1')}>Fecha y hora<input className={input} type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} /></label>
            <label className={cx(field, 'w-28')}>Duración (min)<input className={input} type="number" min={15} step={15} value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></label>
          </div>
          {update.error && <p className="mb-3 rounded-lg bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700 ring-1 ring-rose-200">{update.error.message}</p>}
          <div className="flex justify-end gap-2.5 pt-1">
            <button type="button" className={btn('secondary')} onClick={() => setEditing(false)}>Cancelar</button>
            <button type="submit" className={btn()} disabled={update.isPending}>{update.isPending ? 'Guardando…' : 'Guardar cambios'}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

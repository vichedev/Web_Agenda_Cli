import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, type Client } from '../lib/api';
import { btn, cx, field, input } from '../lib/ui';

/** Formulario de cliente: sirve para crear y para editar. */
export function ClientForm({ client, onDone }: { client?: Client; onDone: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: client?.name ?? '', email: client?.email ?? '',
    company: client?.company ?? '', address: client?.address ?? '', notes: client?.notes ?? '',
  });
  const save = useMutation({
    mutationFn: () => api.saveClient(form, client?.id),
    onSuccess: () => { qc.invalidateQueries(); onDone(); },
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };

  return (
    <form className="flex flex-col p-5 sm:p-6" onSubmit={submit}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <label className={field}>Nombre<input className={input} required autoFocus value={form.name} onChange={set('name')} /></label>
        <label className={field}>Empresa<input className={input} value={form.company} onChange={set('company')} /></label>
        <label className={field}>Correo<input className={input} type="email" value={form.email} onChange={set('email')} /></label>
      </div>
      <label className={field}>Dirección<input className={input} value={form.address} onChange={set('address')} /></label>
      <label className={field}>Notas internas<textarea className={input} rows={2} value={form.notes} onChange={set('notes')} /></label>
      {save.error && <p className="mb-3 rounded-lg bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700 ring-1 ring-rose-200">{save.error.message}</p>}
      <div className={cx('flex flex-wrap gap-2.5')}>
        <button type="submit" className={btn()} disabled={save.isPending}>{save.isPending ? 'Guardando…' : client ? 'Guardar cambios' : 'Guardar cliente'}</button>
        <button type="button" className={btn('secondary')} onClick={onDone}>Cancelar</button>
      </div>
    </form>
  );
}

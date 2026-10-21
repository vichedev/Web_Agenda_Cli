import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { auth } from '../lib/api';
import { dateTimeOf } from '../lib/format';
import { ChatIcon } from './Icons';

interface Toast { id: number; title: string; client: string; when: string }

/**
 * Tiempo real: mantiene abierta una conexion de eventos con el servidor. Cuando algo cambia
 * (el bot agenda un soporte, cambia un estado, se crea un cliente...) refresca los datos al instante
 * y, si lo agendo el bot por WhatsApp, muestra un aviso.
 */
export function Realtime() {
  const qc = useQueryClient();
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let es: EventSource | null = null;
    let retry: number | undefined;
    let closed = false;

    const refresh = (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

    const connect = () => {
      const token = auth.get();
      if (!token || closed) return;
      es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);

      es.addEventListener('supports', (e) => {
        const d = JSON.parse((e as MessageEvent).data) as { action: string; source?: string; title?: string; client?: string; scheduledAt?: string };
        refresh('supports', 'upcoming', 'history', 'history-months', 'clients');
        if (d.action === 'created' && d.source === 'whatsapp') {
          const toast = { id: Date.now(), title: d.title ?? 'Soporte', client: d.client ?? '', when: d.scheduledAt ? dateTimeOf(d.scheduledAt) : '' };
          setToasts((t) => [...t, toast]);
          window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== toast.id)), 8000);
        }
      });
      es.addEventListener('clients', () => refresh('clients', 'client'));
      es.addEventListener('activity', () => refresh('wa-activity'));
      es.addEventListener('settings', () => refresh('settings'));
      // Si la conexion se cierra del todo (p. ej. reinicio del servidor), se reintenta.
      es.onerror = () => {
        if (es?.readyState === EventSource.CLOSED && !closed) retry = window.setTimeout(connect, 5000);
      };
    };

    connect();
    return () => { closed = true; window.clearTimeout(retry); es?.close(); };
  }, [qc]);

  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="animate-fade pointer-events-auto flex items-start gap-3 rounded-xl bg-white p-3.5 shadow-lg ring-1 ring-slate-200">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><ChatIcon className="size-4.5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-slate-900">Nuevo soporte agendado por WhatsApp</p>
            <p className="truncate text-[13px] text-slate-600">{t.client}{t.client && t.title ? ' · ' : ''}{t.title}</p>
            {t.when && <p className="text-xs text-slate-400">{t.when}</p>}
          </div>
          <button type="button" aria-label="Cerrar aviso" className="rounded-md px-1.5 text-lg leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}>×</button>
        </div>
      ))}
    </div>
  );
}

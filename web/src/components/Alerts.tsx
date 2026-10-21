import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Support } from '../lib/api';
import { beep, systemNotify } from '../lib/alerts';
import { timeOf } from '../lib/format';
import { btn, cx } from '../lib/ui';
import { useSecond } from '../lib/useNow';
import { Countdown } from './Countdown';
import { BellIcon } from './Icons';

type Stage = 'pre' | 'start';
interface Alert { key: string; stage: Stage; support: Pick<Support, 'id' | 'title' | 'client_name' | 'scheduled_at'> }

const STORE = 'agenda_alerts_v1';
const loadSeen = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(STORE) ?? '[]')); } catch { return new Set(); }
};
const saveSeen = (s: Set<string>) => {
  try { localStorage.setItem(STORE, JSON.stringify([...s].slice(-200))); } catch { /* sin almacenamiento */ }
};

/**
 * Alertas de soportes proximos, dentro de la web:
 *  - "pre": cuando faltan los minutos configurados (o menos, si se agendo con poca antelacion);
 *  - "start": al llegar la hora, con boton para marcarlo "En curso".
 * Cada alerta suena, muestra una tarjeta y, si hay permiso, una notificacion del sistema. No se repite
 * (se recuerda en el navegador) y se reinicia si el soporte se reprograma.
 */
export function Alerts() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const upcoming = useQuery({ queryKey: ['upcoming'], queryFn: api.upcoming, refetchInterval: 60_000, staleTime: 0 });
  const now = useSecond();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const seen = useRef<Set<string>>(loadSeen());

  const minutes = settings.data?.reminderMinutes ?? 10;
  const enabled = settings.data?.reminderEnabled ?? true;

  const fire = useCallback((a: Alert) => {
    setAlerts((all) => (all.some((x) => x.key === a.key) ? all : [...all, a]));
    beep(a.stage);
    const when = timeOf(a.support.scheduled_at);
    systemNotify(
      a.stage === 'start' ? 'Es la hora de un soporte' : 'Soporte por empezar',
      `${a.support.client_name} · ${a.support.title} (${when})`,
      a.key,
    );
    if (a.stage === 'pre') window.setTimeout(() => setAlerts((all) => all.filter((x) => x.key !== a.key)), 45_000);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    for (const s of upcoming.data ?? []) {
      const ms = new Date(s.scheduled_at).getTime() - now;
      const k = (stage: Stage) => `${s.id}:${s.scheduled_at}:${stage}`;
      let stage: Stage | null = null;
      if (ms <= 0 && ms > -15 * 60_000) stage = 'start';
      else if (ms > 0 && ms <= minutes * 60_000) stage = 'pre';
      if (!stage || seen.current.has(k(stage))) continue;
      seen.current.add(k(stage));
      if (stage === 'start') seen.current.add(k('pre')); // si abrio tarde, no tiene sentido el aviso previo
      saveSeen(seen.current);
      fire({ key: k(stage), stage, support: s });
    }
  }, [now, upcoming.data, minutes, enabled, fire]);

  // Prueba manual desde Configuracion
  useEffect(() => {
    const test = () => fire({
      key: `test:${Date.now()}`, stage: 'pre',
      support: { id: 0, title: 'Alerta de prueba', client_name: 'Cliente de ejemplo', scheduled_at: new Date(Date.now() + 10 * 60_000).toISOString() },
    });
    window.addEventListener('agenda:test-alert', test);
    return () => window.removeEventListener('agenda:test-alert', test);
  }, [fire]);

  const start = useMutation({
    mutationFn: (id: number) => api.setStatus(id, 'in_progress'),
    onSuccess: () => qc.invalidateQueries(),
  });
  const close = (key: string) => setAlerts((all) => all.filter((x) => x.key !== key));

  if (!alerts.length) return null;
  return (
    <div className="pointer-events-none fixed top-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3" role="alert" aria-live="assertive">
      {alerts.map((a) => (
        <div key={a.key} className={cx('animate-fade pointer-events-auto overflow-hidden rounded-xl bg-white shadow-xl ring-1', a.stage === 'start' ? 'ring-rose-300' : 'ring-amber-300')}>
          <div className={cx('flex items-center gap-2 px-4 py-2 text-[13px] font-semibold', a.stage === 'start' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800')}>
            <BellIcon className="size-4" />
            {a.stage === 'start' ? 'Es la hora del soporte' : 'Soporte por empezar'}
            <button type="button" aria-label="Cerrar alerta" onClick={() => close(a.key)} className="ml-auto rounded px-1.5 text-lg leading-none opacity-60 hover:opacity-100">×</button>
          </div>
          <div className="px-4 py-3">
            <p className="font-semibold text-slate-900">{a.support.client_name}</p>
            <p className="text-[13px] text-slate-600">{a.support.title}</p>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <span className="tabular-nums">{timeOf(a.support.scheduled_at)}</span>
              <Countdown iso={a.support.scheduled_at} always />
            </div>
            <div className="mt-3 flex gap-2">
              {a.stage === 'start' && a.support.id > 0 && (
                <button type="button" className={btn('primary', 'sm')} disabled={start.isPending} onClick={() => { start.mutate(a.support.id); close(a.key); }}>
                  Marcar en curso
                </button>
              )}
              <button type="button" className={btn('secondary', 'sm')} onClick={() => close(a.key)}>Entendido</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

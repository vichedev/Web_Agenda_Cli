import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ComponentType, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BellIcon, ChatIcon, ClockIcon, LockIcon, SparkIcon, UsersIcon } from '../components/Icons';
import { BrowserAlerts } from '../components/BrowserAlerts';
import { PhoneList } from '../components/PhoneList';
import { PageHead, Switch } from '../components/ui';
import { WA_INFO, WhatsAppPanel } from '../components/WhatsAppPanel';
import { api, type WaActivity } from '../lib/api';
import { btn, cx, field, input } from '../lib/ui';

const OUTCOME: Record<string, { label: string; tone: string }> = {
  scheduled: { label: 'Agendado', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  needs_info: { label: 'Faltan datos', tone: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  awaiting: { label: 'Esperando su respuesta', tone: 'bg-sky-50 text-sky-700 ring-sky-600/20' },
  blocked: { label: 'Bloqueado: no está en la lista blanca', tone: 'bg-rose-50 text-rose-700 ring-rose-600/20' },
  unresolved: { label: 'No se pudo identificar el número', tone: 'bg-rose-50 text-rose-700 ring-rose-600/20' },
  error: { label: 'Error al procesar', tone: 'bg-rose-50 text-rose-700 ring-rose-600/20' },
  ignored: { label: 'Sin acción', tone: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
};

type ModuleId = 'whatsapp' | 'whitelist' | 'activity' | 'reminders' | 'ai';
const MODULES: { id: ModuleId; label: string; title: string; desc: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'whatsapp', label: 'WhatsApp', icon: ChatIcon, title: 'Conexión de WhatsApp', desc: 'Vincule el teléfono del bot escaneando el QR y defina qué cuenta se acepta.' },
  { id: 'whitelist', label: 'Mis números', icon: UsersIcon, title: 'Mis números autorizados', desc: 'Herramienta personal: el bot solo atiende y avisa a estos números. Cualquier otro mensaje se ignora sin respuesta.' },
  { id: 'activity', label: 'Actividad', icon: ClockIcon, title: 'Mensajes recientes', desc: 'Qué recibió el bot y qué hizo con cada mensaje. Útil para saber por qué no respondió.' },
  { id: 'reminders', label: 'Recordatorios', icon: BellIcon, title: 'Recordatorios', desc: 'Avisos por WhatsApp y alertas con cuenta regresiva antes de cada soporte y al llegar la hora.' },
  { id: 'ai', label: 'Inteligencia artificial', icon: SparkIcon, title: 'Inteligencia artificial', desc: 'Groq interpreta los mensajes, redacta recordatorios y transcribe las notas de voz.' },
];

const note = 'mt-3 text-[13px] text-slate-500';
const withIcon = (Icon: ComponentType<{ className?: string }>, child: ReactNode) => (
  <span className="relative block">
    <Icon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
    {child}
  </span>
);

export function SettingsPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const active = (MODULES.find((m) => m.id === params.get('modulo'))?.id ?? 'whatsapp') as ModuleId;
  const setActive = (id: ModuleId) => setParams({ modulo: id }, { replace: true });

  const { data } = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const wa = useQuery({ queryKey: ['wa'], queryFn: api.waStatus, refetchInterval: 5000, staleTime: 0 });
  const activity = useQuery({ queryKey: ['wa-activity'], queryFn: api.waActivity, refetchInterval: 4000, staleTime: 0 });

  const [f, setF] = useState({ groqApiKey: '', groqChatModel: '', groqSttModel: '', waPhone: '', reminderMinutes: 10 });
  const [allowed, setAllowed] = useState<string[]>([]);
  const [remindOn, setRemindOn] = useState(true);
  const [saved, setSaved] = useState(false);

  const load = () => {
    if (!data) return;
    setF({ groqApiKey: '', groqChatModel: data.groqChatModel, groqSttModel: data.groqSttModel, waPhone: data.waPhone, reminderMinutes: data.reminderMinutes });
    setAllowed(data.allowedPhones);
    setRemindOn(data.reminderEnabled);
  };
  useEffect(load, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => {
    if (!data) return false;
    return (
      f.groqApiKey !== '' || f.groqChatModel !== data.groqChatModel || f.groqSttModel !== data.groqSttModel || f.waPhone !== data.waPhone ||
      f.reminderMinutes !== data.reminderMinutes || remindOn !== data.reminderEnabled ||
      JSON.stringify(allowed) !== JSON.stringify(data.allowedPhones)
    );
  }, [data, f, allowed, remindOn]);

  const save = useMutation({
    mutationFn: () => api.saveSettings({
      groqApiKey: f.groqApiKey || undefined, groqChatModel: f.groqChatModel, groqSttModel: f.groqSttModel, waPhone: f.waPhone,
      allowedPhones: allowed, reminderEnabled: remindOn, reminderMinutes: f.reminderMinutes,
    }),
    onSuccess: () => { qc.invalidateQueries(); setSaved(true); setTimeout(() => setSaved(false), 2500); },
  });

  const set = (k: 'groqApiKey' | 'groqChatModel' | 'groqSttModel' | 'waPhone') => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };

  const blocked = (activity.data ?? []).filter((m) => m.outcome === 'blocked' && /^\d+$/.test(m.phone) && !allowed.includes(m.phone));
  const badges: Partial<Record<ModuleId, ReactNode>> = {
    whatsapp: <i className={cx('size-2 rounded-full', (wa.data ? WA_INFO[wa.data.state] : WA_INFO.starting).dot)} />,
    whitelist: <Count n={allowed.length} warn={allowed.length === 0} />,
    activity: blocked.length > 0 ? <Count n={blocked.length} warn /> : undefined,
    reminders: <span className={cx('text-[11px] font-medium', remindOn ? 'text-emerald-600' : 'text-slate-400')}>{remindOn ? 'Activo' : 'Apagado'}</span>,
  };
  const mod = MODULES.find((m) => m.id === active)!;

  return (
    <>
      <PageHead title="Configuración" subtitle="Cada módulo agrupa un tema. Los cambios se aplican al pulsar Guardar." />

      <form onSubmit={submit} className="grid gap-5 md:h-[calc(100vh-12.5rem)] md:min-h-130 md:grid-cols-[230px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200/80 md:flex-col md:self-start" aria-label="Módulos">
          {MODULES.map(({ id, label, icon: Icon }) => (
            <button
              key={id} type="button" onClick={() => setActive(id)} aria-current={id === active ? 'page' : undefined}
              className={cx(
                'flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition md:w-full',
                id === active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
              )}
            >
              <Icon className={cx('size-4.5 shrink-0', id === active ? 'text-indigo-600' : 'text-slate-400')} />
              <span className="flex-1 whitespace-nowrap">{label}</span>
              {badges[id]}
            </button>
          ))}
        </nav>

        <section className="flex min-h-0 flex-col rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80">
          <div className="border-b border-slate-100 px-6 py-4.5">
            <h2 className="text-base font-semibold text-slate-900">{mod.title}</h2>
            <p className="mt-0.5 text-[13px] text-slate-500">{mod.desc}</p>
          </div>

          <div className="animate-fade min-h-0 flex-1 overflow-y-auto p-6" key={active}>
            {active === 'whatsapp' && (
              <div className="grid gap-8 lg:grid-cols-2">
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-slate-800">Estado de la sesión</h3>
                  <WhatsAppPanel />
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-slate-800">Teléfono verificado</h3>
                  <label className={field}>Número que se escaneará (con código de país)
                    {withIcon(ChatIcon, <input className={`${input} pl-9`} placeholder="593999999999" value={f.waPhone} onChange={set('waPhone')} />)}
                  </label>
                  <p className="text-[13px] text-slate-500">Si se vincula otra cuenta, la sesión se rechaza. Déjelo vacío para aceptar cualquiera.</p>
                </div>
              </div>
            )}

            {active === 'whitelist' && (
              <div className="max-w-xl">
                <PhoneList value={allowed} onChange={setAllowed} empty="La lista está vacía: el bot no responderá a nadie." />
                <p className={note}>Escriba al bot desde uno de estos números e indique siempre el cliente. Ej: "Soporte para Juan Pérez mañana a las 10, la impresora no imprime".</p>
              </div>
            )}

            {active === 'activity' && (
              <ActivityList items={activity.data ?? []} allowed={allowed} onAuthorize={(p) => { setAllowed([...allowed, p]); setActive('whitelist'); }} />
            )}

            {active === 'reminders' && (
              <div className="max-w-xl">
                <Switch checked={remindOn} onChange={setRemindOn} label="Enviar recordatorios" hint="Solo soportes pendientes. Si se reprograma, se vuelve a avisar." />
                {remindOn && (
                  <div className="animate-fade">
                    <label className={field}>Minutos de antelación
                      <input className={`${input} max-w-32`} type="number" min={1} max={240} required value={f.reminderMinutes}
                        onChange={(e) => setF({ ...f, reminderMinutes: Number(e.target.value) })} />
                    </label>
                    <p className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-[13px] text-slate-600 ring-1 ring-slate-200">
                      Por WhatsApp, solo a sus números de la lista blanca: un aviso antes (con el cliente, la dirección, si se cruza con otro soporte y cuál sigue)
                      y otro al llegar la hora. Si agenda con poca antelación, el aviso sale de inmediato.
                    </p>
                  </div>
                )}
                <BrowserAlerts />
              </div>
            )}

            {active === 'ai' && (
              <div className="max-w-xl">
                <label className={field}>API key de Groq
                  {withIcon(LockIcon, <input className={`${input} pl-9`} type="password" autoComplete="off" value={f.groqApiKey} onChange={set('groqApiKey')}
                    placeholder={data?.groqApiKeySet ? `Guardada ${data.groqApiKeyHint}` : 'gsk_…'} />)}
                </label>
                {data?.groqApiKeySet && <p className="-mt-2 mb-4 text-[13px] text-slate-500">Deje el campo vacío para conservar la clave actual.</p>}
                <div className="grid gap-x-4 sm:grid-cols-2">
                  <label className={field}>Modelo de chat<input className={input} required value={f.groqChatModel} onChange={set('groqChatModel')} /></label>
                  <label className={field}>Modelo de transcripción<input className={input} required value={f.groqSttModel} onChange={set('groqSttModel')} /></label>
                </div>
              </div>
            )}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t border-slate-100 bg-slate-50/70 px-6 py-3.5">
            <p className={cx('flex items-center gap-2 text-[13px]', dirty ? 'font-medium text-amber-700' : 'text-slate-500')}>
              <i className={cx('size-2 rounded-full', dirty ? 'bg-amber-500' : 'bg-emerald-500')} />
              {save.error ? <span className="text-rose-600">{save.error.message}</span> : saved ? 'Cambios guardados' : dirty ? 'Hay cambios sin guardar' : 'Todo guardado'}
            </p>
            <div className="flex gap-2.5">
              <button type="button" className={btn('secondary')} disabled={!dirty || save.isPending} onClick={load}>Descartar</button>
              <button type="submit" className={btn()} disabled={!dirty || save.isPending}>{save.isPending ? 'Guardando…' : 'Guardar cambios'}</button>
            </div>
          </footer>
        </section>
      </form>
    </>
  );
}

function Count({ n, warn }: { n: number; warn?: boolean }) {
  return (
    <span className={cx('min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums', warn ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600')}>{n}</span>
  );
}

function ActivityList({ items, allowed, onAuthorize }: { items: WaActivity[]; allowed: string[]; onAuthorize: (phone: string) => void }) {
  if (items.length === 0) return <p className="text-[13px] text-slate-500">Todavía no ha llegado ningún mensaje al número vinculado.</p>;
  return (
    <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
      {items.map((m) => {
        const o = OUTCOME[m.outcome ?? 'ignored'] ?? OUTCOME.ignored;
        const isPhone = /^\d+$/.test(m.phone);
        return (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium tabular-nums text-slate-900">
                {isPhone ? `+${m.phone}` : m.phone}
                <span className="ml-2 text-xs font-normal text-slate-400">
                  {m.type === 'audio' ? 'audio' : m.type === 'text' ? 'texto' : m.type} · {new Date(m.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </p>
              {m.body && <p className="truncate text-[13px] text-slate-500">{m.body}</p>}
            </div>
            <div className="flex items-center gap-2.5">
              <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', o.tone)}>{o.label}</span>
              {m.outcome === 'blocked' && isPhone && !allowed.includes(m.phone) && (
                <button type="button" className={btn('secondary', 'sm')} onClick={() => onAuthorize(m.phone)}>Autorizar</button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

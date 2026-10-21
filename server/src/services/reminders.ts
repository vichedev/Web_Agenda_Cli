import { DateTime } from 'luxon';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { groqJson } from './groq.js';
import { getSettings } from './settings.js';
import { getStatus, sendText } from './whatsapp.js';

const TICK_MS = 30_000;

interface Due {
  id: number; title: string; description: string | null; scheduled_at: string; duration_min: number; created_at: string;
  client_id: number; client_name: string; company: string | null; address: string | null; notes: string | null;
}

/**
 * Recordatorios inteligentes. Cada 30 s busca soportes pendientes que empiezan dentro de la ventana
 * configurada (por defecto 10 min) y avisa por WhatsApp:
 *  - redacta el mensaje con IA usando el contexto real (cliente, historial, choques de agenda, siguiente soporte)
 *    y cae a una plantilla si la IA falla; va solo al dueno de la agenda (lista blanca);
 *  - es idempotente (reminded_at) y se reintenta si WhatsApp esta desconectado;
 *  - se reinicia solo si el soporte se reprograma, y no avisa de soportes cancelados o ya iniciados;
 *  - si el soporte se agenda con poca antelacion (ya dentro de la ventana), el aviso sale en el siguiente ciclo;
 *  - al llegar la hora envia un segundo aviso "es la hora".
 */
export function startReminders() {
  const run = () => tick().catch((e) => console.error('recordatorios', e));
  setTimeout(run, 5_000);
  return setInterval(run, TICK_MS);
}

async function tick() {
  const s = await getSettings();
  if (!s.reminderEnabled || getStatus().state !== 'connected') return;

  const due = await query<Due>(
    `SELECT s.id, s.title, s.description, s.scheduled_at, s.duration_min, s.created_at,
            c.id AS client_id, c.name AS client_name, c.company, c.address, c.notes
     FROM supports s JOIN clients c ON c.id = s.client_id
     WHERE s.status = 'pending' AND s.reminded_at IS NULL
       AND s.scheduled_at > now() AND s.scheduled_at <= now() + make_interval(mins => $1)
     ORDER BY s.scheduled_at`,
    [s.reminderMinutes],
  );

  for (const sup of due) {
    // Reclamo atomico: si otra pasada ya lo tomo, no se envia dos veces.
    const claimed = await query('UPDATE supports SET reminded_at = now() WHERE id = $1 AND reminded_at IS NULL RETURNING id', [sup.id]);
    if (!claimed.length) continue;

    const ok = await notify(sup, s).catch((e) => { console.error('recordatorio', sup.id, e); return false; });
    if (!ok) await query('UPDATE supports SET reminded_at = NULL WHERE id = $1', [sup.id]); // reintenta en el proximo ciclo
  }

  await startAlerts(s);
}

/** Aviso "es la hora": una sola vez, hasta 15 min despues de la hora si el soporte sigue pendiente. */
async function startAlerts(s: Awaited<ReturnType<typeof getSettings>>) {
  if (!s.allowedPhones.length) return;
  const due = await query<{ id: number; title: string; client_name: string; address: string | null }>(
    `SELECT s.id, s.title, c.name AS client_name, c.address
     FROM supports s JOIN clients c ON c.id = s.client_id
     WHERE s.status = 'pending' AND s.start_alerted_at IS NULL
       AND s.scheduled_at <= now() AND s.scheduled_at > now() - interval '15 minutes'
     ORDER BY s.scheduled_at`,
  );
  for (const sup of due) {
    const claimed = await query('UPDATE supports SET start_alerted_at = now() WHERE id = $1 AND start_alerted_at IS NULL RETURNING id', [sup.id]);
    if (!claimed.length) continue;
    const text = [`Es la hora: soporte para ${sup.client_name}: ${sup.title}.`, sup.address ? `Direccion: ${sup.address}` : '', 'Cuando empiece, márquelo "En curso" en el sistema.'].filter(Boolean).join('\n');
    let sent = false;
    for (const to of s.allowedPhones) sent = (await sendText(to, text)) || sent;
    if (!sent) await query('UPDATE supports SET start_alerted_at = NULL WHERE id = $1', [sup.id]); // reintenta
  }
}

/** Herramienta personal: el aviso va solo a los numeros de la lista blanca (el dueno de la agenda). */
async function notify(sup: Due, s: Awaited<ReturnType<typeof getSettings>>) {
  if (!s.allowedPhones.length) return true; // nadie a quien avisar: se da por atendido
  const ctx = await context(sup);
  const text = await compose(sup, ctx);
  let sent = false;
  for (const to of s.allowedPhones) sent = (await sendText(to, text)) || sent;
  return sent;
}

const fmt = (iso: string) => DateTime.fromISO(new Date(iso).toISOString(), { zone: config.TZ_APP }).toFormat('HH:mm');

/** Hechos reales que la IA puede usar. Nunca se le pide inventar nada fuera de esto. */
async function context(sup: Due) {
  const [hist] = await query<{ done: number; total: number; last_title: string | null; last_at: string | null }>(
    `SELECT count(*) FILTER (WHERE status = 'completed')::int AS done, count(*)::int AS total,
            (SELECT title FROM supports WHERE client_id = $1 AND id <> $2 AND status = 'completed' ORDER BY scheduled_at DESC LIMIT 1) AS last_title,
            (SELECT scheduled_at FROM supports WHERE client_id = $1 AND id <> $2 AND status = 'completed' ORDER BY scheduled_at DESC LIMIT 1) AS last_at
     FROM supports WHERE client_id = $1 AND id <> $2`,
    [sup.client_id, sup.id],
  );
  const conflicts = await query<{ title: string; client_name: string; scheduled_at: string }>(
    `SELECT s.title, c.name AS client_name, s.scheduled_at FROM supports s JOIN clients c ON c.id = s.client_id
     WHERE s.id <> $1 AND s.status IN ('pending','in_progress')
       AND tstzrange(s.scheduled_at, s.scheduled_at + make_interval(mins => s.duration_min))
        && tstzrange($2::timestamptz, $2::timestamptz + make_interval(mins => $3))
     ORDER BY s.scheduled_at LIMIT 3`,
    [sup.id, sup.scheduled_at, sup.duration_min],
  );
  const [next] = await query<{ title: string; client_name: string; scheduled_at: string }>(
    `SELECT s.title, c.name AS client_name, s.scheduled_at FROM supports s JOIN clients c ON c.id = s.client_id
     WHERE s.status = 'pending' AND s.id <> $1 AND s.scheduled_at >= $2::timestamptz + make_interval(mins => $3)
       AND s.scheduled_at < $2::timestamptz + make_interval(mins => $3 + 120)
     ORDER BY s.scheduled_at LIMIT 1`,
    [sup.id, sup.scheduled_at, sup.duration_min],
  );
  return { hist, conflicts, next };
}

type Ctx = Awaited<ReturnType<typeof context>>;

async function compose(sup: Due, ctx: Ctx): Promise<string> {
  const minutes = Math.max(1, Math.round((new Date(sup.scheduled_at).getTime() - Date.now()) / 60_000));
  const facts = {
    empieza_en_minutos: minutes,
    hora: fmt(sup.scheduled_at),
    duracion_min: sup.duration_min,
    asunto: sup.title,
    detalle: sup.description,
    cliente: sup.client_name,
    empresa: sup.company,
    direccion: sup.address,
    notas_del_cliente: sup.notes,
    historial: ctx.hist.total
      ? { soportes_previos: ctx.hist.total, completados: ctx.hist.done, ultimo_completado: ctx.hist.last_title }
      : undefined,
    choques_de_agenda: ctx.conflicts.map((c) => ({ hora: fmt(c.scheduled_at), asunto: c.title, cliente: c.client_name })),
    siguiente_soporte: ctx.next ? { hora: fmt(ctx.next.scheduled_at), asunto: ctx.next.title, cliente: ctx.next.client_name } : undefined,
  };

  try {
    const out = await groqJson(
      'Redactas recordatorios breves de WhatsApp en espanol para un tecnico independiente que lleva su propia agenda de soportes; ' +
        'el mensaje es para el, no para el cliente. Usa SOLO los hechos del JSON; no inventes datos. ' +
        'Tono directo y profesional, sin emojis ni formato markdown, maximo 450 caracteres. ' +
        'Menciona cuantos minutos faltan, la hora, el cliente y el asunto; incluye la direccion si existe y una pista util del historial o las notas si aporta. ' +
        'Avisa claramente de choques_de_agenda si hay y cierra con el siguiente_soporte si existe. ' +
        'Responde SOLO un JSON: {"mensaje": "..."}.',
      JSON.stringify(facts),
    );
    const msg = typeof out.mensaje === 'string' ? out.mensaje.trim() : '';
    if (msg) return msg;
  } catch (e) {
    console.warn('IA no disponible para el recordatorio, se usa plantilla:', (e as Error).message);
  }
  return template(sup, ctx, minutes);
}

function template(sup: Due, ctx: Ctx, minutes: number) {
  const lines = [`Recordatorio: en ${minutes} min (${fmt(sup.scheduled_at)}) soporte para ${sup.client_name}: ${sup.title}.`];
  if (sup.address) lines.push(`Direccion: ${sup.address}`);
  if (ctx.conflicts.length) lines.push(`Atencion, se cruza con: ${ctx.conflicts.map((c) => `${fmt(c.scheduled_at)} ${c.client_name}`).join(', ')}.`);
  if (ctx.next) lines.push(`Luego: ${fmt(ctx.next.scheduled_at)} ${ctx.next.client_name}.`);
  return lines.join('\n');
}

import { DateTime } from 'luxon';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { broadcast } from './events.js';
import { interpretFollowUp, interpretMessage } from './intent.js';
import { getSettings } from './settings.js';
import { createSupport } from './supports.js';
import { sendText } from './whatsapp.js';

export interface IncomingMessage {
  id: string;
  from: string;
  type: string;
  text?: string;
  /** Descarga y transcribe el audio (solo para type 'audio'). */
  getAudioText?: () => Promise<string>;
}

type Outcome = 'scheduled' | 'needs_info' | 'awaiting' | 'error' | 'ignored';
interface Result { outcome: Outcome; supportId?: number }
interface Opt { id: number; name: string }

/**
 * Solicitud en construccion. Se conserva entre mensajes para ir completando lo que falte
 * (cliente, fecha, hora) sin que el usuario tenga que repetir nada.
 */
interface Draft {
  body: string;
  /** Nombre del cliente tal como se dijo la primera vez (para corregir el asunto si se elige otro). */
  spoken: string | null;
  clientName: string | null;
  clientId: number | null;
  /** Lista numerada de clientes mostrada al usuario para que elija (primero los parecidos). */
  options: Opt[] | null;
  /** Cuantas de las primeras opciones son nombres parecidos al dicho. */
  similarCount: number;
  /** Clientes que no cupieron en la lista mostrada. */
  hidden: number;
  /** El usuario acepto crear el cliente nuevo en el sistema. */
  addConfirmed: boolean;
  title: string | null;
  description: string | null;
  date: string | null;
  time: string | null;
  /** El soporte YA se realizo: se registra como completado (se permite fecha pasada). */
  done: boolean;
  /** La hora indicada ya paso y se le pregunto si fue un soporte ya realizado. */
  askPast: boolean;
  tries: number;
}

const PENDING_MINUTES = 15;
const MAX_TRIES = 3;
const MAX_OPTIONS = 9;

const BYE = 'Cuando quiera, envíeme otro soporte.';
const HELP = 'Dígame el cliente, el problema, la fecha y la hora y lo guardo. Ej: "Soporte para Juan Pérez mañana a las 10, la impresora no imprime". Si ya lo hizo, dígalo: "Registra un soporte para Juan Pérez, fue hoy a las 3, instalé la impresora".';

/**
 * Herramienta personal. Lista blanca: solo se atiende a los numeros del dueno; el resto se ignora en silencio.
 * El dueno siempre nombra al cliente; si no existe, el bot ofrece crearlo en el sistema o elegir uno existente.
 */
export async function handleIncoming(msg: IncomingMessage) {
  if (!(await getSettings()).allowedPhones.includes(msg.from)) {
    // Sin respuesta ni contenido: solo queda constancia del numero para poder autorizarlo desde la web.
    console.log(`[whatsapp] ignorado: +${msg.from} no esta en la lista blanca`);
    await query(
      `INSERT INTO whatsapp_messages (wa_message_id, phone, type, outcome) VALUES ($1,$2,$3,'blocked') ON CONFLICT (wa_message_id) DO NOTHING`,
      [msg.id, msg.from, msg.type],
    );
    broadcast('activity');
    return;
  }

  // Idempotencia: los reintentos de entrega no se procesan dos veces.
  const inserted = await query(
    `INSERT INTO whatsapp_messages (wa_message_id, phone, type) VALUES ($1,$2,$3)
     ON CONFLICT (wa_message_id) DO NOTHING RETURNING id`,
    [msg.id, msg.from, msg.type],
  );
  if (!inserted.length) return;
  const logId = inserted[0].id;

  let result: Result = { outcome: 'error' };
  let body: string | undefined;
  try {
    if (msg.type !== 'text' && msg.type !== 'audio') {
      result = { outcome: 'ignored' };
      await sendText(msg.from, 'Por favor envíe un mensaje de texto o una nota de voz para agendar su soporte.');
      return;
    }
    body = msg.type === 'audio' ? await msg.getAudioText!() : msg.text;
    if (!body) { result = { outcome: 'ignored' }; return; }

    // ¿Es la respuesta a una pregunta anterior?
    const draft = await takePending(msg.from);
    if (draft) {
      const handled = await continueDraft(msg.from, draft, body);
      if (handled) { result = handled; return; }
    }
    result = await startRequest(msg.from, body);
  } catch (e) {
    console.error('Error procesando mensaje de WhatsApp', msg.id, e);
    result = { outcome: 'error' };
    await sendText(msg.from, 'Ocurrió un problema procesando su mensaje. Intente de nuevo en unos minutos.').catch(() => {});
  } finally {
    await query('UPDATE whatsapp_messages SET body=$2, outcome=$3, support_id=$4 WHERE id=$1', [logId, body ?? null, result.outcome, result.supportId ?? null]);
    broadcast('activity');
  }
}

/** Primer mensaje: saludo, agradecimiento o solicitud de agendar. */
async function startRequest(from: string, body: string): Promise<Result> {
  const intent = await interpretMessage(body);

  if (intent.action === 'chat') {
    await sendText(from, intent.chat === 'greeting'
      ? `¡Hola! Soy su asistente de agenda. ${HELP}`
      : '¡Con gusto! Aquí estaré cuando necesite agendar otro soporte. ¡Hasta luego!');
    return { outcome: 'ignored' };
  }
  if (intent.action !== 'schedule') {
    await sendText(from, `Puedo guardar sus soportes pendientes. ${HELP}`);
    return { outcome: 'ignored' };
  }
  return advance(from, {
    body, spoken: intent.clientName, clientName: intent.clientName, clientId: null, options: null, similarCount: 0, hidden: 0, addConfirmed: false,
    title: intent.title, description: intent.description, date: intent.date, time: intent.time, done: intent.done, askPast: false, tries: 0,
  });
}

/** Respuesta a una pregunta pendiente. Devuelve null si el mensaje es una solicitud distinta. */
async function continueDraft(from: string, d: Draft, body: string): Promise<Result | null> {
  const t = norm(body);
  // Un "no" solo (o "no gracias", "cancelar") cancela; "no, es para mañana a las 9" es una correccion.
  if (isNo(t) && t.split(' ').length <= 2) return cancel(from);

  const choosing = !d.clientId && !d.addConfirmed;
  const f = await interpretFollowUp(body, { clientName: d.clientName, asked: missingList(d), options: d.options?.map((o) => o.name) });
  if (f.answer === 'no' && !f.date && !f.time && !f.clientName) return cancel(from);

  let gained = false;
  let prefix = '';

  if (choosing && d.options) {
    // 1) Eligio de la lista (numero, o nombrandolo)
    const typed = /^(?:el|la|opcion|numero|n)?\s*(\d{1,2})$/.exec(t);
    const pick = typed ? Number(typed[1]) : f.choice;
    if (pick && pick >= 1 && pick <= d.options.length) {
      const o = d.options[pick - 1];
      d.clientId = o.id; d.clientName = o.name; d.options = null;
      gained = true;
    } else if (/\b(nuevo|nueva|agregar|agregalo|crear|crealo|anadir)\b/.test(t)) {
      // 2) Quiere crear el cliente nuevo
      d.addConfirmed = true; gained = true;
    } else if ((f.answer === 'yes' || isYes(t)) && d.clientName) {
      if (d.similarCount === 1) { // "¿Quiso decir X?" -> "si"
        const o = d.options[0];
        d.clientId = o.id; d.clientName = o.name; d.options = null; gained = true;
      } else if (d.similarCount === 0) { // "¿Lo agrego?" -> "si"
        d.addConfirmed = true; gained = true;
      } else {
        prefix = 'Hay varios parecidos, ¿cuál de ellos? ';
      }
    }
    // 3) Escribio otro nombre: se vuelve a buscar
    if (!gained && !prefix) {
      const typedName = f.clientName ?? (!f.date && !f.time && /^[\p{L}\s.'-]{3,40}$/u.test(body.trim()) && !isYes(t) ? body.trim() : null);
      if (typedName && norm(typedName) !== norm(d.clientName ?? '')) {
        d.clientName = typedName; d.options = null; gained = true;
      }
    }
  } else if (f.clientName && !d.clientId && !d.clientName) {
    d.clientName = f.clientName; gained = true;
  }

  if (d.askPast) {
    // Se le pregunto si fue un soporte ya realizado: "si" lo registra completado; otra fecha/hora reemplaza la anterior.
    if (f.date || f.time) { if (f.date) d.date = f.date; if (f.time) d.time = f.time; d.askPast = false; gained = true; }
    else if (f.answer === 'yes' || isYes(t)) { d.done = true; d.askPast = false; gained = true; }
  } else {
    if (f.date && !d.date) { d.date = f.date; gained = true; }
    if (f.time && !d.time) { d.time = f.time; gained = true; }
  }
  if (f.title && !d.title) d.title = f.title;

  if (!gained && !prefix) {
    if (body.length > 40) return null; // parece una solicitud nueva
    d.tries += 1;
    if (d.tries >= MAX_TRIES) {
      await sendText(from, `No logré entender los datos, así que cancelé esta solicitud. ${BYE}`);
      return { outcome: 'ignored' };
    }
    prefix = 'No logré entender su respuesta. ';
  } else if (gained) d.tries = 0;
  return advance(from, d, prefix);
}

async function cancel(from: string): Promise<Result> {
  await sendText(from, `De acuerdo, no se agendó el soporte. ${BYE}`);
  return { outcome: 'ignored' };
}

/** Decide el siguiente paso: preguntar lo que falta o agendar. */
async function advance(from: string, d: Draft, prefix = ''): Promise<Result> {
  // 1. Cliente: buscarlo y, si no es seguro, dejar que el usuario elija o lo cree
  if (!d.clientId && d.clientName && !d.addConfirmed && !d.options) {
    const found = await resolveClient(d.clientName);
    if (found.kind === 'found') { d.clientId = found.client.id; d.clientName = found.client.name; }
    else { d.options = found.options; d.similarCount = found.similarCount; d.hidden = found.hidden; }
  }
  if (!d.clientId && !d.clientName && !d.options) {
    const all = await listClients();
    d.options = all.options; d.similarCount = 0; d.hidden = all.hidden;
  }

  // Si se eligio otro cliente distinto del que se dijo, el asunto no debe conservar el nombre equivocado.
  if (d.clientId && d.spoken && d.title && norm(d.spoken) !== norm(d.clientName ?? '')) {
    d.title = d.title.replace(new RegExp(escapeRe(d.spoken), 'gi'), d.clientName!);
  }

  // 2. Fecha y hora validas y futuras
  let scheduledAt: string | null = null;
  if (d.date && d.time) {
    const dt = DateTime.fromFormat(`${d.date} ${d.time}`, 'yyyy-MM-dd HH:mm', { zone: config.TZ_APP });
    if (!dt.isValid) { d.date = d.time = null; prefix += 'No pude interpretar la fecha y la hora. '; }
    else if (dt < DateTime.now() && !d.done) {
      // Hora pasada sin decir que ya se hizo: si el cliente ya esta resuelto, se pregunta; si no, primero se resuelve el cliente.
      if (d.clientId || d.addConfirmed) {
        d.askPast = true;
        return ask(from, d, [
          `${prefix}La hora indicada (${prettyWhen(dt.toISO()!)}) ya pasó.`,
          '¿Fue un soporte que ya realizó y quiere registrarlo como completado? Responda SI.',
          'O dígame otra fecha y hora si quería agendarlo. Responda NO para cancelar.',
        ].join('\n'));
      }
    } else scheduledAt = dt.toISO();
  }
  // Un soporte "ya realizado" con fecha futura no tiene sentido: se agenda como pendiente.
  const completed = !!(d.done && scheduledAt && DateTime.fromISO(scheduledAt) <= DateTime.now());

  // 3. ¿Falta algo?
  const choosingClient = !d.clientId && !d.addConfirmed;
  const need = missingList(d).filter((n) => !(choosingClient && n === 'el nombre del cliente'));
  if (choosingClient || need.length) {
    const lines: string[] = [];
    if (choosingClient) lines.push(...clientQuestion(d, prefix));
    else lines.push(`${prefix}${d.clientId ? `Para agendar el soporte de ${d.clientName}` : `Perfecto, crearé a ${d.clientName} en el sistema. Para agendar`} me falta información.`);
    if (need.length) lines.push(`Además necesito: ${joinEs(need)}.`);
    else if (choosingClient && scheduledAt) lines.push(`${completed ? 'Registraré el soporte como completado' : 'Agendaré el soporte'} para ${prettyWhen(scheduledAt)}.`);
    const hint = [!d.date && !d.time ? 'mañana a las 10' : !d.date ? 'mañana' : !d.time ? 'a las 10' : null].filter(Boolean);
    if (hint.length) lines.push(`Puede decir la fecha y hora junto con su respuesta. Ej: "${choosingClient ? '2, ' : ''}${hint[0]}".`);
    lines.push('Responda NO para cancelar.');
    return ask(from, d, lines.join('\n'));
  }

  // 4. Completo: se crea el cliente si hacia falta y se agenda.
  let client: { id: number; name: string };
  let note = '';
  if (d.clientId) client = { id: d.clientId, name: d.clientName! };
  else {
    // Cliente nuevo: solo se crea en la base de datos del sistema (sin telefono ni contactos del celular).
    const inactive = (await query('SELECT id, name FROM clients WHERE lower(name) = lower($1) AND NOT active LIMIT 1', [d.clientName]))[0];
    if (inactive) {
      await query('UPDATE clients SET active = TRUE, updated_at = now() WHERE id = $1', [inactive.id]);
      client = inactive;
      note = `Cliente "${client.name}" restaurado en el sistema.\n`;
    } else {
      client = (await query('INSERT INTO clients (name) VALUES ($1) RETURNING id, name', [titleCase(d.clientName!)]))[0];
      broadcast('clients');
      note = `Cliente "${client.name}" creado en el sistema.\n`;
    }
  }
  const support = await createSupport({
    clientId: client.id,
    title: d.title ?? 'Soporte solicitado por WhatsApp',
    description: d.description ?? d.body,
    scheduledAt: scheduledAt!,
    source: 'whatsapp',
    status: completed ? 'completed' : 'pending',
  });
  await sendText(from, [
    `${note}Listo, soporte ${completed ? 'registrado como completado' : 'agendado'}:`,
    `Cliente: ${client.name}`,
    `Asunto: ${support.title}`,
    `Fecha: ${prettyWhen(scheduledAt!)}`,
    `¡Hasta luego! ${BYE}`,
  ].join('\n'));
  return { outcome: 'scheduled', supportId: support.id };
}

/** Pregunta por el cliente: ofrece crearlo, elegir uno parecido o uno de la lista. */
function clientQuestion(d: Draft, prefix: string): string[] {
  const opts = d.options ?? [];
  const list = (from: number, to: number) => opts.slice(from, to).map((o, i) => `${from + i + 1}. ${o.name}`);
  const more = d.hidden ? [`(y ${d.hidden} más; escriba parte del nombre para buscarlo)`] : [];

  if (!d.clientName) {
    return [`${prefix}¿Para qué cliente es el soporte?`, ...(opts.length ? ['Elija con su número o escriba el nombre:', ...list(0, opts.length), ...more] : [])];
  }
  if (d.similarCount > 0) {
    const others = opts.length > d.similarCount ? ['Otros clientes:', ...list(d.similarCount, opts.length)] : [];
    return [
      `${prefix}No encontré exactamente a "${d.clientName}". ¿Quiso decir alguno de estos?`,
      ...list(0, d.similarCount), ...others, ...more,
      `Responda con el número para elegirlo, o NUEVO para agregar a "${d.clientName}" como cliente nuevo en el sistema.`,
    ];
  }
  return [
    `${prefix}No encontré a "${d.clientName}" entre sus clientes.`,
    '¿Desea agregarlo al sistema como cliente nuevo? Responda SI para crearlo.',
    ...(opts.length ? ['Si lo dijo mal, elija uno existente con su número:', ...list(0, opts.length), ...more] : []),
  ];
}

async function ask(from: string, d: Draft, text: string): Promise<Result> {
  await savePending(from, d);
  await sendText(from, text);
  return { outcome: 'awaiting' };
}

function missingList(d: Draft): string[] {
  const need: string[] = [];
  if (!d.clientName && !d.clientId) need.push('el nombre del cliente');
  if (!d.date) need.push('la fecha');
  if (!d.time) need.push('la hora');
  return need;
}

// ---------- Busqueda de clientes (insensible a acentos y mayusculas) ----------

const bigrams = (s: string) => {
  const t = s.replace(/\s/g, '');
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
};
function dice(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const pool = new Map<string, number>();
  for (const x of a) pool.set(x, (pool.get(x) ?? 0) + 1);
  let common = 0;
  for (const y of b) {
    const c = pool.get(y) ?? 0;
    if (c > 0) { common++; pool.set(y, c - 1); }
  }
  return (2 * common) / (a.length + b.length);
}
/** 1 = mismo nombre; 0.75 si un nombre contiene todas las palabras del otro; si no, similitud de bigramas. */
function similarity(a: string, b: string) {
  const x = norm(a), y = norm(b);
  if (x === y) return 1;
  const tx = x.split(' '), ty = y.split(' ');
  const subset = (p: string[], q: string[]) => p.every((w) => q.includes(w));
  const score = dice(bigrams(x), bigrams(y));
  return subset(tx, ty) || subset(ty, tx) ? Math.max(score, 0.75) : score;
}

async function listClients() {
  const all = await query<Opt>('SELECT id, name FROM clients WHERE active ORDER BY name');
  return { all, options: all.slice(0, MAX_OPTIONS), hidden: Math.max(0, all.length - MAX_OPTIONS) };
}

async function resolveClient(name: string) {
  const { all } = await listClients();
  const scored = all.map((c) => ({ ...c, score: similarity(name, c.name) })).sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (best && best.score >= 0.88 && (!second || best.score - second.score >= 0.1)) return { kind: 'found' as const, client: best };
  const similar = scored.filter((c) => c.score >= 0.4).slice(0, 5);
  const others = all.filter((c) => !similar.some((s) => s.id === c.id));
  const options = [...similar, ...others].slice(0, MAX_OPTIONS).map(({ id, name: n }) => ({ id, name: n }));
  return { kind: 'choose' as const, options, similarCount: Math.min(similar.length, options.length), hidden: Math.max(0, all.length - options.length) };
}

// ---------- Estado pendiente ----------

async function savePending(phone: string, payload: Draft) {
  await query(
    `INSERT INTO wa_pending (phone, step, payload, expires_at) VALUES ($1,'draft',$2, now() + make_interval(mins => $3))
     ON CONFLICT (phone) DO UPDATE SET step = EXCLUDED.step, payload = EXCLUDED.payload, expires_at = EXCLUDED.expires_at`,
    [phone, JSON.stringify(payload), PENDING_MINUTES],
  );
}

/** Lee y elimina el borrador vigente del remitente. */
async function takePending(phone: string): Promise<Draft | null> {
  const rows = await query<{ step: string; payload: Draft; valid: boolean }>(
    'DELETE FROM wa_pending WHERE phone = $1 RETURNING step, payload, expires_at > now() AS valid', [phone],
  );
  const r = rows[0];
  if (!r || !r.valid || r.step !== 'draft') return null;
  const p = r.payload;
  return { ...p, spoken: p.spoken ?? null, options: p.options ?? null, similarCount: p.similarCount ?? 0, hidden: p.hidden ?? 0, addConfirmed: !!p.addConfirmed, done: !!p.done, askPast: !!p.askPast };
}

// ---------- Utilidades de texto ----------

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const isYes = (t: string) => /^(si|s|claro|ok|okay|dale|yes|afirmativo|agrega|agregalo|agregar|de acuerdo|por favor|listo)\b/.test(t);
const isNo = (t: string) => /^(no|n|nel|cancela|cancelar|nada|negativo)\b/.test(t);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const joinEs = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} y ${items.at(-1)}` : items[0] ?? '');
const titleCase = (s: string) => s.trim().toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
const prettyWhen = (iso: string) => DateTime.fromISO(iso, { zone: config.TZ_APP }).setLocale('es').toFormat("cccc d 'de' LLLL, HH:mm");

/** Mensaje cuyo numero no se pudo determinar (identificador @lid sin equivalencia): se registra para diagnostico. */
export async function recordUnresolved(id: string, jid: string, type: string) {
  await query(
    `INSERT INTO whatsapp_messages (wa_message_id, phone, type, outcome) VALUES ($1,$2,$3,'unresolved') ON CONFLICT (wa_message_id) DO NOTHING`,
    [id, jid, type],
  );
  broadcast('activity');
}

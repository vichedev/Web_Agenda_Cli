import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { rm } from 'node:fs/promises';
import pino from 'pino';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { groqTranscribe } from './groq.js';
import { getSettings } from './settings.js';
import { handleIncoming, recordUnresolved } from './whatsappFlow.js';

type State = 'starting' | 'qr' | 'connected' | 'disconnected' | 'mismatch';

let sock: WASocket | undefined;
let state: State = 'starting';
let qrDataUrl: string | null = null;
let me: string | null = null;
let stopping = false;
let expected = '';
let notice: string | null = null;

export const getStatus = () => ({ state, qr: qrDataUrl, me, expected, notice });

/** Inicia la sesion de WhatsApp Web (no oficial). La primera vez requiere escanear el QR. */
export async function startWhatsApp() {
  expected = (await getSettings()).waPhone;
  const { state: auth, saveCreds } = await useMultiFileAuthState(config.WA_AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  state = 'starting';

  sock = makeWASocket({
    auth,
    version,
    logger: pino({ level: 'silent' }),
    browser: ['Agenda Soportes', 'Chrome', '1.0'],
    markOnlineOnConnect: false,
  });
  const current = sock;

  current.ev.on('creds.update', saveCreds);

  current.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      state = 'qr';
      qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 1 });
    }
    if (connection === 'open') {
      state = 'connected';
      qrDataUrl = null;
      me = current.user?.id?.split(':')[0]?.split('@')[0] ?? null;
      console.log('WhatsApp conectado como', me);
      await enforceLinkedPhone();
      if (state === 'connected') notice = null;
    }
    if (connection === 'close') {
      if (state !== 'mismatch') state = 'disconnected';
      me = null;
      const code = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        // Sesion cerrada desde el telefono: se borran credenciales y se pide un QR nuevo.
        await rm(config.WA_AUTH_DIR, { recursive: true, force: true });
        console.log('Sesion de WhatsApp cerrada; escanee un nuevo QR.');
      }
      if (!stopping) setTimeout(() => startWhatsApp().catch(console.error), 3000);
    }
  });

  current.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) onMessage(m).catch((e) => console.error('mensaje WhatsApp', e));
  });
}

/**
 * Verifica que la cuenta escaneada sea el telefono configurado. Si no coincide se desvincula
 * y queda en estado 'mismatch' hasta que se escanee con el numero correcto.
 */
export async function enforceLinkedPhone() {
  expected = (await getSettings()).waPhone;
  if (state === 'connected' && expected && me && me !== expected) {
    console.warn(`Cuenta vinculada (${me}) distinta a la configurada (${expected}); se desvincula.`);
    state = 'mismatch';
    notice = `Se escaneo el numero ${me}, pero el configurado es ${expected}. Escanee con el telefono correcto.`;
    await logoutWhatsApp();
  }
}

/** Cierra la sesion vinculada y fuerza un nuevo QR. */
export async function logoutWhatsApp() {
  await sock?.logout().catch(() => {});
}

export async function stopWhatsApp() {
  stopping = true;
  sock?.end(undefined);
}

/** Envia un texto. Devuelve false si no hay conexion o el envio falla (el llamador decide si reintenta). */
export async function sendText(phone: string, body: string): Promise<boolean> {
  if (state !== 'connected' || !sock) {
    console.log(`[whatsapp:sin-conexion] -> ${phone}: ${body}`);
    return false;
  }
  try {
    await sock.sendMessage(`${phone}@s.whatsapp.net`, { text: body });
    return true;
  } catch (e) {
    console.error('No se pudo enviar WhatsApp a', phone, e);
    return false;
  }
}

/**
 * Obtiene el numero real del remitente. Las cuentas con LID (@lid) traen el numero en un campo alterno
 * o se resuelve con el mapa LID -> numero de Baileys.
 */
async function senderPhone(m: WAMessage): Promise<string | null> {
  const key = m.key as typeof m.key & { senderPn?: string; remoteJidAlt?: string };
  const direct = [key.remoteJid, key.remoteJidAlt, key.senderPn].find((j) => j?.endsWith('@s.whatsapp.net'));
  if (direct) return direct.split('@')[0].split(':')[0];
  const lid = [key.remoteJid, key.remoteJidAlt].find((j) => j?.endsWith('@lid'));
  if (lid && sock) {
    const pn = await sock.signalRepository.lidMapping.getPNForLID(lid).catch(() => null);
    if (pn) return pn.split('@')[0].split(':')[0];
  }
  return null;
}

async function onMessage(m: WAMessage) {
  if (m.key.fromMe || !m.message || !m.key.id) return;
  const jid = m.key.remoteJid ?? '';
  if (jid.endsWith('@g.us') || jid === 'status@broadcast') return; // solo chats privados
  const from = await senderPhone(m);
  const kind = m.message.audioMessage ? 'audio' : m.message.conversation || m.message.extendedTextMessage ? 'texto' : 'otro';
  console.log(`[whatsapp] mensaje ${kind} de ${from ?? `${jid} (numero no resuelto)`}`);
  if (!from) {
    await recordUnresolved(m.key.id, jid, kind);
    return;
  }

  const text = m.message.conversation ?? m.message.extendedTextMessage?.text ?? undefined;
  const audio = m.message.audioMessage;
  await handleIncoming({
    id: m.key.id,
    from,
    type: audio ? 'audio' : text ? 'text' : 'other',
    text,
    getAudioText: audio
      ? async () => {
          const buf = (await downloadMediaMessage(m, 'buffer', {})) as Buffer;
          return groqTranscribe(buf, audio.mimetype ?? 'audio/ogg');
        }
      : undefined,
  });
}

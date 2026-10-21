import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db/pool.js';

/** Parametros editables desde la web. Si no hay valor en BD se usan los de .env como valor inicial. */
export interface AppSettings {
  groqApiKey: string;
  groqChatModel: string;
  groqSttModel: string;
  /** Telefono (E.164 sin +) de la cuenta de WhatsApp que se vincula por QR. Vacio = cualquiera. */
  waPhone: string;
  /** Lista blanca: tus numeros. Es una herramienta personal: el bot solo atiende y avisa a estos numeros. */
  allowedPhones: string[];
  /** Recordatorios previos al soporte. */
  reminderEnabled: boolean;
  reminderMinutes: number;
}

const digits = (v: string) => v.replace(/\D/g, '');
const list = (v: string) => v.split(',').filter(Boolean);

function defaults(): AppSettings {
  return {
    groqApiKey: config.GROQ_API_KEY,
    groqChatModel: config.GROQ_CHAT_MODEL,
    groqSttModel: config.GROQ_STT_MODEL,
    waPhone: '',
    allowedPhones: [], // por defecto el bot no responde a nadie hasta configurar la lista blanca
    reminderEnabled: true,
    reminderMinutes: 10,
  };
}

let cache: AppSettings | undefined;

export async function getSettings(): Promise<AppSettings> {
  if (cache) return cache;
  const s = defaults();
  const rows = await query<{ key: string; value: string }>('SELECT key, value FROM settings');
  for (const { key, value } of rows) {
    if (key === 'groq_api_key') s.groqApiKey = value;
    else if (key === 'groq_chat_model') s.groqChatModel = value;
    else if (key === 'groq_stt_model') s.groqSttModel = value;
    else if (key === 'wa_phone') s.waPhone = value;
    else if (key === 'allowed_phones') s.allowedPhones = list(value);
    else if (key === 'reminder_enabled') s.reminderEnabled = value === 'true';
    else if (key === 'reminder_minutes') s.reminderMinutes = Number(value) || 10;
  }
  return (cache = s);
}

const phone = z.string().transform(digits).pipe(z.string().min(8).max(15));

export const settingsInput = z.object({
  groqApiKey: z.string().trim().optional(), // vacio u omitido = conservar la actual
  groqChatModel: z.string().trim().min(1),
  groqSttModel: z.string().trim().min(1),
  waPhone: z.union([z.literal(''), phone]),
  allowedPhones: z.array(phone),
  reminderEnabled: z.boolean(),
  reminderMinutes: z.number().int().min(1).max(240),
});

export async function saveSettings(input: z.infer<typeof settingsInput>) {
  const current = await getSettings();
  const next: AppSettings = {
    groqApiKey: input.groqApiKey || current.groqApiKey,
    groqChatModel: input.groqChatModel,
    groqSttModel: input.groqSttModel,
    waPhone: input.waPhone,
    allowedPhones: [...new Set(input.allowedPhones)],
    reminderEnabled: input.reminderEnabled,
    reminderMinutes: input.reminderMinutes,
  };
  const entries: [string, string][] = [
    ['groq_api_key', next.groqApiKey], ['groq_chat_model', next.groqChatModel], ['groq_stt_model', next.groqSttModel],
    ['wa_phone', next.waPhone], ['allowed_phones', next.allowedPhones.join(',')],
    ['reminder_enabled', String(next.reminderEnabled)], ['reminder_minutes', String(next.reminderMinutes)],
  ];
  for (const [k, v] of entries) {
    await query(
      `INSERT INTO settings (key, value) VALUES ($1,$2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [k, v]);
  }
  cache = next;
  return next;
}

/** Vista segura para la web: la clave nunca sale completa. */
export function publicView(s: AppSettings) {
  return {
    groqApiKeySet: Boolean(s.groqApiKey),
    groqApiKeyHint: s.groqApiKey ? `…${s.groqApiKey.slice(-4)}` : '',
    groqChatModel: s.groqChatModel,
    groqSttModel: s.groqSttModel,
    waPhone: s.waPhone,
    allowedPhones: s.allowedPhones,
    reminderEnabled: s.reminderEnabled,
    reminderMinutes: s.reminderMinutes,
  };
}

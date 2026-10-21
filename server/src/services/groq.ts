import { getSettings } from './settings.js';

const BASE = 'https://api.groq.com/openai/v1';

async function conf() {
  const s = await getSettings();
  if (!s.groqApiKey) throw new Error('Falta la API key de Groq: configurela en Configuracion');
  return { auth: { Authorization: `Bearer ${s.groqApiKey}` }, chat: s.groqChatModel, stt: s.groqSttModel };
}

/** Transcribe una nota de voz con Whisper en Groq. */
export async function groqTranscribe(data: Buffer, mime: string): Promise<string> {
  const { auth, stt } = await conf();
  const ext = mime.includes('mpeg') ? 'mp3' : mime.includes('mp4') ? 'm4a' : 'ogg';
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(data)], { type: mime }), `audio.${ext}`);
  form.append('model', stt);
  form.append('language', 'es');
  const res = await fetch(`${BASE}/audio/transcriptions`, { method: 'POST', headers: auth, body: form });
  if (!res.ok) throw new Error(`Groq transcripcion: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { text: string }).text.trim();
}

/** Chat que responde un objeto JSON. */
export async function groqJson(system: string, user: string): Promise<Record<string, unknown>> {
  const { auth, chat } = await conf();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: chat,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Groq chat: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  return JSON.parse(json.choices[0].message.content);
}

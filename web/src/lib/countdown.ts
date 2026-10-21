export type Tone = 'later' | 'soon' | 'now' | 'late';

const pad = (n: number) => String(n).padStart(2, '0');
const span = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`);

/** Tiempo que falta (o que paso) para un soporte, con el texto y el tono a mostrar. Fuera de rango: hidden. */
export function remaining(iso: string, nowMs: number, soonMin = 10) {
  const ms = new Date(iso).getTime() - nowMs;
  const abs = Math.abs(ms);
  const min = Math.floor(abs / 60_000);
  const sec = Math.floor((abs % 60_000) / 1000);
  const hidden = ms > 3 * 3_600_000 || ms < -2 * 3_600_000;

  if (ms > 0) {
    const tone: Tone = ms <= soonMin * 60_000 ? 'soon' : 'later';
    return { ms, hidden, tone, label: ms < soonMin * 60_000 ? `en ${pad(min)}:${pad(sec)}` : `en ${span(min)}` };
  }
  if (abs < 60_000) return { ms, hidden, tone: 'now' as Tone, label: 'Ahora' };
  return { ms, hidden, tone: 'late' as Tone, label: `hace ${span(min)}` };
}

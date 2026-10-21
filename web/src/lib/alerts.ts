let ctx: AudioContext | undefined;

/** Sonido de alerta generado en el navegador (sin archivos). Puede estar bloqueado hasta que el usuario interactue. */
export function beep(kind: 'pre' | 'start' = 'pre') {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const tones = kind === 'start' ? [880, 880, 1175] : [660, 880];
    tones.forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx!.destination);
      const t = ctx!.currentTime + i * 0.22;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  } catch { /* sin audio disponible */ }
}

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const notificationPermission = () => (notificationsSupported() ? Notification.permission : 'denied');

/** Notificacion del sistema (aparece aunque la pestana este en segundo plano). */
export function systemNotify(title: string, body: string, tag: string) {
  try {
    if (notificationPermission() === 'granted') new Notification(title, { body, tag, requireInteraction: true });
  } catch { /* ignorado */ }
}

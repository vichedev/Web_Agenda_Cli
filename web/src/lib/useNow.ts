import { useEffect, useState, useSyncExternalStore } from 'react';

/** Fecha y hora actuales, actualizadas en vivo (cambia sola al pasar la medianoche). */
export function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// Reloj compartido de 1 segundo: todos los temporizadores de la pantalla comparten un unico intervalo.
const listeners = new Set<() => void>();
let timer: number | undefined;
let snapshot = Date.now();

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (timer === undefined) {
    snapshot = Date.now();
    timer = window.setInterval(() => { snapshot = Date.now(); listeners.forEach((l) => l()); }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size) { window.clearInterval(timer); timer = undefined; }
  };
}

/** Milisegundos actuales, actualizados cada segundo. */
export const useSecond = () => useSyncExternalStore(subscribe, () => snapshot);

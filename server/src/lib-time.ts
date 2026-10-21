import { DateTime } from 'luxon';
import { config } from './config.js';

/** Rango [inicio, fin) de un mes 'YYYY-MM' en la zona horaria de la app, como ISO UTC. */
export function monthRange(month: string) {
  const start = DateTime.fromFormat(month, 'yyyy-MM', { zone: config.TZ_APP });
  if (!start.isValid) throw new Error('Mes invalido, use YYYY-MM');
  return { from: start.toUTC().toISO()!, to: start.plus({ months: 1 }).toUTC().toISO()! };
}

export const nowInTz = () => DateTime.now().setZone(config.TZ_APP);

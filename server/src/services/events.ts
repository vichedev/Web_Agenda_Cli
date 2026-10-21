import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

/**
 * Tiempo real con Server-Sent Events: la web abre una conexion y el servidor le avisa cuando algo cambia
 * (soporte agendado por WhatsApp o desde otra pestana, cliente nuevo, actividad del bot...).
 */
export type EventType = 'supports' | 'clients' | 'activity' | 'wa' | 'settings';

const listeners = new Set<Response>();

export function broadcast(type: EventType, data: Record<string, unknown> = {}) {
  const frame = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of listeners) res.write(frame);
}

/** GET /api/events?token=JWT (EventSource no permite cabeceras, por eso el token va en la URL). */
export function eventsHandler(req: Request, res: Response) {
  try {
    jwt.verify(String(req.query.token ?? ''), config.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'No autorizado' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // nginx: no almacenar en buffer
  });
  res.write('retry: 3000\n\n');
  listeners.add(res);

  const ping = setInterval(() => res.write(': ping\n\n'), 25_000); // mantiene viva la conexion
  req.on('close', () => { clearInterval(ping); listeners.delete(res); });
}

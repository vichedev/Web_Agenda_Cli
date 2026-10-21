import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import { config } from '../config.js';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  try {
    if (!token) throw new Error();
    jwt.verify(token, config.JWT_SECRET);
    next();
  } catch {
    next(new HttpError(401, 'No autorizado'));
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    // Mensaje propio si lo hay; si no, se indica que campos revisar.
    const custom = err.issues.find((i) => !/^(Invalid|Required|String must|Expected|Number must|Array must)/.test(i.message));
    const fields = [...new Set(err.issues.map((i) => i.path.join('.')).filter(Boolean))].join(', ');
    return res.status(400).json({ error: custom?.message ?? `Datos inválidos${fields ? `: revise ${fields}` : ''}`, details: err.flatten() });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  const pgErr = err as { code?: string };
  if (pgErr.code === '23505') return res.status(409).json({ error: 'Registro duplicado' });
  if (pgErr.code === '23503') return res.status(409).json({ error: 'El registro tiene datos relacionados' });
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
}

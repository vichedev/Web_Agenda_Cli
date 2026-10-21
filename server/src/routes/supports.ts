import { Router } from 'express';
import { z } from 'zod';
import { HttpError, wrap } from '../middleware/http.js';
import { monthRange } from '../lib-time.js';
import * as svc from '../services/supports.js';

const statusEnum = z.enum(['pending', 'in_progress', 'completed', 'cancelled']);
const body = z.object({
  clientId: z.number().int().positive(),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1, 'La descripción es obligatoria'),
  scheduledAt: z.string().datetime({ offset: true }),
  durationMin: z.number().int().positive().max(1440).optional(),
});
const createBody = body.extend({ status: z.enum(['pending', 'completed']).optional() });
const id = (v: string) => z.coerce.number().int().positive().parse(v);

export const supportsRouter = Router();

supportsRouter.get('/', wrap(async (req, res) => {
  const q = z.object({
    month: z.string().optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    clientId: z.coerce.number().optional(),
    status: statusEnum.optional(),
  }).parse(req.query);
  const range = q.month ? monthRange(q.month) : { from: q.from, to: q.to };
  res.json(await svc.listSupports({ ...range, clientId: q.clientId, status: q.status }));
}));

supportsRouter.get('/upcoming', wrap(async (_req, res) => res.json(await svc.listUpcoming())));

supportsRouter.post('/', wrap(async (req, res) => {
  res.status(201).json(await svc.createSupport({ ...createBody.parse(req.body), source: 'web' }));
}));

supportsRouter.put('/:id', wrap(async (req, res) => {
  const row = await svc.updateSupport(id(req.params.id), body.partial().parse(req.body));
  if (!row) throw new HttpError(404, 'Soporte no encontrado');
  res.json(row);
}));

supportsRouter.patch('/:id/status', wrap(async (req, res) => {
  const { status } = z.object({ status: statusEnum }).parse(req.body);
  const row = await svc.setStatus(id(req.params.id), status);
  if (!row) throw new HttpError(404, 'Soporte no encontrado');
  res.json(row);
}));

supportsRouter.delete('/:id', wrap(async (req, res) => {
  if (!(await svc.deleteSupport(id(req.params.id)))) throw new HttpError(404, 'Soporte no encontrado');
  res.status(204).end();
}));

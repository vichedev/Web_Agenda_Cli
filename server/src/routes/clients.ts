import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { HttpError, wrap } from '../middleware/http.js';
import { monthRange } from '../lib-time.js';
import { broadcast } from '../services/events.js';
import { listSupports } from '../services/supports.js';

const clientBody = z.object({
  name: z.string().trim().min(1),
  email: z.string().email().nullish().or(z.literal('').transform(() => null)),
  company: z.string().trim().nullish(),
  address: z.string().trim().nullish(),
  notes: z.string().trim().nullish(),
});
const idParam = (v: string) => z.coerce.number().int().positive().parse(v);

export const clientsRouter = Router();

// Cualquier cambio exitoso se avisa en tiempo real a la web.
clientsRouter.use((req, res, next) => {
  if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) broadcast('clients'); });
  next();
});

clientsRouter.get('/', wrap(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const rows = await query(
    `SELECT c.*, (SELECT count(*)::int FROM supports s WHERE s.client_id = c.id) AS supports_count
     FROM clients c
     WHERE c.active AND ($1 = '' OR c.name ILIKE '%' || $1 || '%' OR c.company ILIKE '%' || $1 || '%')
     ORDER BY c.name`, [q]);
  res.json(rows);
}));

const nul = (v?: string | null) => (v && v.trim() ? v.trim() : null);

clientsRouter.post('/', wrap(async (req, res) => {
  const b = clientBody.parse(req.body);
  const [dup] = await query('SELECT id, name, active FROM clients WHERE lower(name) = lower($1) ORDER BY active DESC LIMIT 1', [b.name]);
  if (dup?.active) throw new HttpError(409, `Ya existe un cliente llamado ${dup.name}`);
  const values = [b.name, nul(b.email), nul(b.company), nul(b.address), nul(b.notes)];
  if (dup) {
    // Mismo nombre que un cliente dado de baja: se restaura con los datos nuevos y conserva su historial.
    const [row] = await query(
      `UPDATE clients SET name=$1, email=$2, company=$3, address=$4, notes=$5, active=TRUE, updated_at=now()
       WHERE id=$6 RETURNING *`, [...values, dup.id]);
    return res.status(200).json(row);
  }
  const [row] = await query(
    `INSERT INTO clients (name, email, company, address, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`, values);
  res.status(201).json(row);
}));

clientsRouter.get('/:id', wrap(async (req, res) => {
  const [row] = await query('SELECT * FROM clients WHERE id = $1', [idParam(req.params.id)]);
  if (!row) throw new HttpError(404, 'Cliente no encontrado');
  res.json(row);
}));

clientsRouter.put('/:id', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = clientBody.parse(req.body);
  const [dup] = await query('SELECT name FROM clients WHERE lower(name) = lower($1) AND id <> $2 AND active', [b.name, id]);
  if (dup) throw new HttpError(409, `Ya existe un cliente llamado ${dup.name}`);
  const [row] = await query(
    `UPDATE clients SET name=$2, email=$3, company=$4, address=$5, notes=$6, updated_at=now()
     WHERE id=$1 RETURNING *`,
    [id, b.name, nul(b.email), nul(b.company), nul(b.address), nul(b.notes)]);
  if (!row) throw new HttpError(404, 'Cliente no encontrado');
  res.json(row);
}));

// Baja logica: conserva el historial de soportes.
clientsRouter.delete('/:id', wrap(async (req, res) => {
  const rows = await query('UPDATE clients SET active = FALSE, updated_at = now() WHERE id = $1 RETURNING id', [idParam(req.params.id)]);
  if (!rows.length) throw new HttpError(404, 'Cliente no encontrado');
  res.status(204).end();
}));

/** Historial tipo calendario: ?month=YYYY-MM devuelve ese mes; sin month, todo. */
clientsRouter.get('/:id/history', wrap(async (req, res) => {
  const clientId = idParam(req.params.id);
  const month = typeof req.query.month === 'string' ? req.query.month : undefined;
  res.json(await listSupports({ clientId, ...(month ? monthRange(month) : {}) }));
}));

/** Meses en los que el cliente tiene soportes (para navegar el historial). */
clientsRouter.get('/:id/history/months', wrap(async (req, res) => {
  res.json(await query(
    `SELECT to_char(scheduled_at AT TIME ZONE $2, 'YYYY-MM') AS month, count(*)::int AS total,
            (count(*) FILTER (WHERE status = 'completed'))::int AS completed
     FROM supports WHERE client_id = $1 GROUP BY 1 ORDER BY 1 DESC`, [idParam(req.params.id), config.TZ_APP]));
}));

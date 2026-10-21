import { query, pool } from '../db/pool.js';
import { broadcast } from './events.js';

export type SupportStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

const SELECT = `
  SELECT s.*, c.name AS client_name, c.phone AS client_phone
  FROM supports s JOIN clients c ON c.id = s.client_id`;

export interface SupportFilters {
  from?: string; to?: string; clientId?: number; status?: SupportStatus;
}

export function listSupports(f: SupportFilters) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (f.from) add('s.scheduled_at >= ?', f.from);
  if (f.to) add('s.scheduled_at < ?', f.to);
  if (f.clientId) add('s.client_id = ?', f.clientId);
  if (f.status) add('s.status = ?', f.status);
  return query(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.scheduled_at`, params);
}

/** Pendientes cercanos (hace 2 h hasta dentro de 24 h) para el temporizador y las alertas de la web. */
export function listUpcoming() {
  return query(`${SELECT} WHERE s.status = 'pending'
    AND s.scheduled_at > now() - interval '2 hours' AND s.scheduled_at <= now() + interval '24 hours'
    ORDER BY s.scheduled_at`);
}

export async function getSupport(id: number) {
  return (await query(`${SELECT} WHERE s.id = $1`, [id]))[0];
}

export interface NewSupport {
  clientId: number; title: string; description?: string | null;
  scheduledAt: string; durationMin?: number; source?: 'web' | 'whatsapp';
}

export async function createSupport(s: NewSupport) {
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    const { rows } = await conn.query(
      `INSERT INTO supports (client_id, title, description, scheduled_at, duration_min, source)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [s.clientId, s.title, s.description ?? null, s.scheduledAt, s.durationMin ?? 60, s.source ?? 'web'],
    );
    await conn.query(`INSERT INTO support_status_log (support_id, to_status) VALUES ($1,'pending')`, [rows[0].id]);
    await conn.query('COMMIT');
    const created = await getSupport(rows[0].id);
    broadcast('supports', { action: 'created', id: created.id, source: s.source ?? 'web', title: created.title, client: created.client_name, scheduledAt: created.scheduled_at });
    return created;
  } catch (e) {
    await conn.query('ROLLBACK');
    throw e;
  } finally {
    conn.release();
  }
}

export async function updateSupport(id: number, p: Partial<Omit<NewSupport, 'source'>>) {
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (col: string, v: unknown) => { params.push(v); sets.push(`${col} = $${params.length}`); };
  if (p.clientId !== undefined) add('client_id', p.clientId);
  if (p.title !== undefined) add('title', p.title);
  if (p.description !== undefined) add('description', p.description);
  if (p.scheduledAt !== undefined) { add('scheduled_at', p.scheduledAt); sets.push('reminded_at = NULL', 'start_alerted_at = NULL'); } // reprogramado: recordar de nuevo
  if (p.durationMin !== undefined) add('duration_min', p.durationMin);
  if (!sets.length) return getSupport(id);
  params.push(id);
  await query(`UPDATE supports SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
  broadcast('supports', { action: 'updated', id });
  return getSupport(id);
}

export async function setStatus(id: number, status: SupportStatus) {
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    const cur = await conn.query('SELECT status FROM supports WHERE id = $1 FOR UPDATE', [id]);
    if (!cur.rows[0]) { await conn.query('ROLLBACK'); return undefined; }
    const from = cur.rows[0].status;
    if (from !== status) {
      await conn.query(
        `UPDATE supports SET status = $2::support_status, updated_at = now(),
           completed_at = CASE WHEN $2::text = 'completed' THEN now() ELSE NULL END WHERE id = $1`,
        [id, status],
      );
      await conn.query('INSERT INTO support_status_log (support_id, from_status, to_status) VALUES ($1,$2,$3)', [id, from, status]);
    }
    await conn.query('COMMIT');
    broadcast('supports', { action: 'status', id, status });
    return getSupport(id);
  } catch (e) {
    await conn.query('ROLLBACK');
    throw e;
  } finally {
    conn.release();
  }
}

export async function deleteSupport(id: number) {
  const deleted = (await query('DELETE FROM supports WHERE id = $1 RETURNING id', [id])).length > 0;
  if (deleted) broadcast('supports', { action: 'deleted', id });
  return deleted;
}

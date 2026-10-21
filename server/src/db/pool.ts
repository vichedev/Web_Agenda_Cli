import pg from 'pg';
import { config } from '../config.js';

pg.types.setTypeParser(20, Number); // BIGINT -> number (ids)

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 });

export async function query<T extends pg.QueryResultRow = any>(text: string, params?: unknown[]) {
  const res = await pool.query<T>(text, params);
  return res.rows;
}

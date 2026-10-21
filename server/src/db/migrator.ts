import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Aplica las migraciones SQL pendientes, cada una en su propia transaccion. */
export async function runMigrations() {
  // La base puede estar arrancando (p. ej. db:local en paralelo): reintenta hasta ~30 s.
  for (let i = 0; ; i++) {
    try { await pool.query('SELECT 1'); break; }
    catch (e) {
      if (i >= 15) throw e;
      console.log('esperando a la base de datos...');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  );
  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (done.has(file)) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(await readFile(path.join(dir, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log('migracion aplicada:', file);
    } catch (e) {
      await client.query('ROLLBACK');
      throw new Error(`Fallo la migracion ${file}: ${(e as Error).message}`);
    } finally {
      client.release();
    }
  }
}

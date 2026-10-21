import { runMigrations } from './migrator.js';
import { pool } from './pool.js';

try {
  await runMigrations();
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await pool.end();
}

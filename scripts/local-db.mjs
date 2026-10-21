// Postgres embebido para desarrollo local (sin Docker). Datos en ./.pgdata
import { existsSync } from 'node:fs';
import EmbeddedPostgres from 'embedded-postgres';

const dir = new URL('../.pgdata', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'agenda', password: 'agenda', port: 5433, persistent: true, initdbFlags: ['--encoding=UTF8', '--locale=C'] });

const fresh = !existsSync(`${dir}/PG_VERSION`);
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase('agenda');
console.log('Postgres local listo en postgres://agenda:agenda@localhost:5433/agenda (Ctrl+C para detener)');

const stop = async () => { await pg.stop(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);

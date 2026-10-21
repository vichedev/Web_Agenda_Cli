import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { errorHandler, requireAuth } from './middleware/http.js';
import { runMigrations } from './db/migrator.js';
import { authRouter } from './routes/auth.js';
import { settingsRouter } from './routes/settings.js';
import { clientsRouter } from './routes/clients.js';
import { supportsRouter } from './routes/supports.js';
import { whatsappRouter } from './routes/whatsapp.js';
import { eventsHandler } from './services/events.js';
import { startReminders } from './services/reminders.js';
import { startWhatsApp } from './services/whatsapp.js';

const app = express();
app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN.split(',') }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
});

app.get('/api/events', eventsHandler);
app.use('/api/auth', authRouter);
app.use('/api/clients', requireAuth, clientsRouter);
app.use('/api/supports', requireAuth, supportsRouter);
app.use('/api/whatsapp', requireAuth, whatsappRouter);
app.use('/api/settings', requireAuth, settingsRouter);
app.use(errorHandler);

await runMigrations();
const server = app.listen(config.PORT, () => console.log(`API en http://localhost:${config.PORT}`));

startWhatsApp().catch((e) => console.error('WhatsApp no pudo iniciar', e));
const reminders = startReminders();

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { clearInterval(reminders); server.close(() => pool.end().then(() => process.exit(0))); });
}

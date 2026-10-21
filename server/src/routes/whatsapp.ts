import { Router } from 'express';
import { query } from '../db/pool.js';
import { wrap } from '../middleware/http.js';
import { getStatus, logoutWhatsApp } from '../services/whatsapp.js';

export const whatsappRouter = Router();

// Estado de la sesion y, si corresponde, el QR (data URL PNG) para vincular el telefono.
whatsappRouter.get('/status', (_req, res) => res.json(getStatus()));

whatsappRouter.post('/logout', wrap(async (_req, res) => {
  await logoutWhatsApp();
  res.status(204).end();
}));

// Ultimos mensajes recibidos y que se hizo con cada uno (sin contenido de los bloqueados).
whatsappRouter.get('/activity', wrap(async (_req, res) => {
  res.json(await query(
    `SELECT id, phone, type, outcome, left(coalesce(body, ''), 80) AS body, created_at
     FROM whatsapp_messages ORDER BY id DESC LIMIT 15`));
}));

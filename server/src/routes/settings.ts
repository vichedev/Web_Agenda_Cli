import { Router } from 'express';
import { wrap } from '../middleware/http.js';
import { broadcast } from '../services/events.js';
import { getSettings, publicView, saveSettings, settingsInput } from '../services/settings.js';
import { enforceLinkedPhone } from '../services/whatsapp.js';

export const settingsRouter = Router();

settingsRouter.get('/', wrap(async (_req, res) => res.json(publicView(await getSettings()))));

settingsRouter.put('/', wrap(async (req, res) => {
  const saved = await saveSettings(settingsInput.parse(req.body));
  await enforceLinkedPhone(); // si ya hay una cuenta vinculada distinta, se desvincula
  broadcast('settings');
  res.json(publicView(saved));
}));

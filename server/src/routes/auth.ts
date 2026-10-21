import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import { HttpError } from '../middleware/http.js';

const safeEq = (a: string, b: string) => {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { user, password } = z.object({ user: z.string(), password: z.string() }).parse(req.body);
  if (!safeEq(user, config.ADMIN_USER) || !safeEq(password, config.ADMIN_PASSWORD)) {
    throw new HttpError(401, 'Credenciales incorrectas');
  }
  res.json({ token: jwt.sign({ sub: user }, config.JWT_SECRET, { expiresIn: '12h' }) });
});

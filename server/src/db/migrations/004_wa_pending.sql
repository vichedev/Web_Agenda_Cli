-- Conversacion pendiente por remitente (p. ej. "no encontre al cliente, ¿lo agrego?").
CREATE TABLE wa_pending (
  phone      TEXT PRIMARY KEY,
  step       TEXT NOT NULL,              -- 'confirm' | 'phone'
  payload    JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE support_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
CREATE TYPE support_source AS ENUM ('web', 'whatsapp');

CREATE TABLE clients (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL UNIQUE,          -- E.164 sin '+', ej. 593999999999
  email       TEXT,
  company     TEXT,
  address     TEXT,
  notes       TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX clients_name_trgm ON clients USING gin (name gin_trgm_ops);

CREATE TABLE supports (
  id            BIGSERIAL PRIMARY KEY,
  client_id     BIGINT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  title         TEXT NOT NULL,
  description   TEXT,
  scheduled_at  TIMESTAMPTZ NOT NULL,
  duration_min  INTEGER NOT NULL DEFAULT 60 CHECK (duration_min > 0),
  status        support_status NOT NULL DEFAULT 'pending',
  source        support_source NOT NULL DEFAULT 'web',
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX supports_scheduled_at ON supports (scheduled_at);
CREATE INDEX supports_client_scheduled ON supports (client_id, scheduled_at);
CREATE INDEX supports_status ON supports (status);

CREATE TABLE support_status_log (
  id          BIGSERIAL PRIMARY KEY,
  support_id  BIGINT NOT NULL REFERENCES supports(id) ON DELETE CASCADE,
  from_status support_status,
  to_status   support_status NOT NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE whatsapp_messages (
  id            BIGSERIAL PRIMARY KEY,
  wa_message_id TEXT NOT NULL UNIQUE,        -- idempotencia ante reintentos de Meta
  phone         TEXT NOT NULL,
  type          TEXT NOT NULL,
  body          TEXT,                         -- texto o transcripcion
  outcome       TEXT,                         -- scheduled | needs_info | error | ignored
  support_id    BIGINT REFERENCES supports(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

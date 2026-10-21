-- Aviso "es la hora": se envia una sola vez cuando llega el momento del soporte.
ALTER TABLE supports ADD COLUMN start_alerted_at TIMESTAMPTZ;

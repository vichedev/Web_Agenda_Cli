-- Marca de recordatorio enviado: evita duplicados y permite reintentar si WhatsApp estaba desconectado.
ALTER TABLE supports ADD COLUMN reminded_at TIMESTAMPTZ;
CREATE INDEX supports_reminder_due ON supports (scheduled_at) WHERE status = 'pending' AND reminded_at IS NULL;

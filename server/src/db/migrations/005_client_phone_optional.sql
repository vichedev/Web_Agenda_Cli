-- El telefono del cliente pasa a ser opcional (los clientes creados desde WhatsApp no lo necesitan).
-- UNIQUE sigue activo: Postgres permite varios NULL, pero no dos clientes con el mismo numero.
ALTER TABLE clients ALTER COLUMN phone DROP NOT NULL;

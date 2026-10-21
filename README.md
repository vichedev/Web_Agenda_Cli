# Agenda de Soportes

React + Vite + Tailwind CSS v4 (web) · Node/Express + TypeScript (API) · PostgreSQL · WhatsApp vía QR (Baileys) · IA con Groq.

## Desarrollo local (sin Docker)

```bash
npm install
npm run db:local     # terminal 1: Postgres embebido en :5433 (datos en .pgdata)
npm run dev          # terminal 2: API :4000 (aplica migraciones solo) + web :5173
```
Cree `.env` desde `.env.example` (para el Postgres local use `DATABASE_URL=postgres://agenda:agenda@localhost:5433/agenda`).
Ingrese a http://localhost:5173 con `ADMIN_USER` / `ADMIN_PASSWORD`. Con Docker/Postgres propio, use `docker compose up -d db` y el puerto 5432.

## Despliegue en servidor (Docker)

Requiere un servidor Linux con acceso a internet. El instalador comprueba Docker (y se ofrece a instalarlo), pide los datos
necesarios, genera los secretos y levanta Postgres + API + web (nginx).

```bash
git clone https://github.com/vichedev/Web_Agenda_Cli.git
cd Web_Agenda_Cli
./install.sh
```

o en un solo paso: `bash <(curl -fsSL https://raw.githubusercontent.com/vichedev/Web_Agenda_Cli/main/install.sh)` (repositorio público).

Pregunta: usuario y contraseña del administrador, puerto HTTP, zona horaria y, opcionalmente, la API key de Groq (también se puede
poner luego en la web). Guarda todo en `.env.prod` (permisos 600, fuera de git). Sin preguntas:
`ADMIN_USER=admin ADMIN_PASSWORD=... HTTP_PORT=80 ./install.sh`.

| Comando | Qué hace |
|---|---|
| `./install.sh update` | Descarga la última versión (`git pull`) y reconstruye, conservando datos y sesión de WhatsApp |
| `./install.sh status` / `logs [servicio]` | Estado de los contenedores / registros en vivo |
| `./install.sh restart` / `stop` / `start` | Controlar los servicios |
| `./install.sh backup` | Copia de la base en `backups/agenda-FECHA.sql.gz` |
| `./install.sh restore <archivo>` | Restaura una copia (reemplaza los datos actuales) |
| `./install.sh uninstall` | Elimina los contenedores; pregunta si también los datos |

Datos persistentes en volúmenes Docker: `pgdata` (base) y `waauth` (sesión de WhatsApp: si se pierde, solo hay que escanear el QR de nuevo).
Tras instalar: entre a la web, escanee el QR (Configuración → WhatsApp) y agregue su número en **Mis números**.
Sirva la web con HTTPS (Caddy, Nginx o Cloudflare) y restrinja el acceso con firewall: la sesión y la contraseña viajan por la red.

## Configuración desde la web

Menú **Configuración**: API key y modelos de Groq, **teléfono verificado** (el número que se escanea; si se escanea otro, se rechaza)
y la lista blanca de números a los que responde el bot. Se guardan en la base de datos; los valores de `.env` solo sirven como valor inicial.

## Estructura

- `server/src/db/migrations` — esquema SQL versionado (`npm run migrate`).
- `server/src/routes` — `clients`, `supports`, `auth`, `webhook` (WhatsApp).
- `server/src/services` — lógica: soportes (con bitácora de estados), WhatsApp, interpretación IA.
- `web/src/pages` — Calendario, Clientes, Detalle de cliente con historial por mes.

## Modelo

- `clients` (baja lógica, el historial se conserva) · `supports` (estado: pendiente → en progreso → completado / cancelado)
- `support_status_log` registra cada cambio de estado · `whatsapp_messages` registra cada mensaje (idempotente por `wa_message_id`).
- Historial por cliente: `GET /api/clients/:id/history?month=YYYY-MM` y `/history/months`.

## WhatsApp (no oficial, vía QR) y Groq

Usa WhatsApp Web mediante Baileys: no requiere Meta ni número de empresa.

1. `npm run dev`, entre a la web → pestaña **WhatsApp** y escanee el QR (WhatsApp → Dispositivos vinculados).
   La sesión se guarda en `wa-auth/` y se restaura al reiniciar.
2. Flujo: mensaje o nota de voz → (audio: transcripción Whisper en Groq) → Llama en Groq extrae cliente, asunto, fecha y hora
   → se agenda y se confirma por WhatsApp. Si falta fecha u hora, el bot las solicita.
   - **Lista blanca:** el bot solo responde a los números que usted autorice en Configuración; cualquier otro se ignora sin respuesta (y sin gastar IA). Con la lista vacía no responde a nadie.
   - Número autorizado que es **cliente** registrado → agenda a su nombre. Si no es cliente → debe nombrarlo ("agenda a Juan Pérez mañana 10:00…"; búsqueda por similitud con pg_trgm).
   - **Conversación con memoria:** si el cliente nombrado no existe, el bot lo dice y ofrece: crearlo en el sistema (SI/NUEVO), elegir uno parecido ("¿quiso decir…?") o uno de la lista numerada, por si lo dijo mal. Pide en el mismo diálogo lo que falte (fecha, hora); se puede responder todo junto ("el 2, mañana a las 10"), por partes o por audio. Al agendar confirma los datos y se despide; entiende saludos y agradecimientos ("Ok!", "gracias") sin soltar el texto de ayuda. El borrador caduca a los 15 min y se cancela con NO.
   - **Soportes ya realizados:** también sirve para anotarlos. "Registra un soporte para Juan Pérez, fue hoy a las 3, instalé la impresora" se guarda como **completado** en esa fecha. Si la hora indicada ya pasó y no se aclaró, el bot pregunta si fue un soporte ya hecho (SI) o si quería otra fecha. En la web: casilla "Ya se realizó" del formulario de soporte.
   - Los grupos se ignoran.
3. Configure `GROQ_API_KEY` en `.env` (modelos ajustables con `GROQ_CHAT_MODEL` / `GROQ_STT_MODEL`).

Riesgo: al ser una API no oficial, WhatsApp puede restringir el número. Úselo con un número dedicado y sin enviar mensajes masivos.

## Tiempo real

La web mantiene una conexión de eventos (SSE, `GET /api/events?token=…`) con el servidor: cuando el bot agenda un soporte, cambia un estado, se edita o se crea un cliente, calendario, clientes y actividad se actualizan al instante, y si lo agendó el bot aparece un aviso. En nginx el endpoint va sin buffer (`docker/nginx.conf`).

## Recordatorios inteligentes

Cada 30 s el servidor busca soportes **pendientes** que empiezan dentro de la ventana configurada (10 min por defecto) y avisa por WhatsApp.
- El mensaje lo redacta Groq con hechos reales: cliente, dirección, historial, **choques de agenda** y siguiente soporte. Si la IA falla, usa una plantilla.
- Va al equipo (lista de destinatarios, o la lista blanca que no son clientes) y, opcionalmente, al cliente con un texto cordial sin datos internos.
- Idempotente (`supports.reminded_at`), reintenta si WhatsApp está desconectado, se reinicia si el soporte se reprograma y omite los cancelados o ya iniciados.
- No repite el aviso si el soporte se agendó con menos antelación que la ventana.
- Todo se ajusta en Configuración → Recordatorios.

## Interfaz

React + Vite + **Tailwind CSS v4** (`@tailwindcss/vite`, tema en `web/src/styles.css`). Tipografía Inter, paleta slate con acento índigo; barra lateral oscura y tarjetas claras. Las clases compartidas (botones, campos, colores por estado) están en `web/src/lib/ui.ts` y los componentes base en `web/src/components/ui.tsx`.

## Notas de producción

- Use un `JWT_SECRET` largo y sirva todo tras HTTPS. Los secretos van en `.env` (ignorado por git), nunca en `.env.example`.
- Zona horaria del servidor: `TZ_APP` (por defecto America/Guayaquil); el calendario web usa la hora del navegador.
- Auth actual: un usuario administrador por `.env`; para varios técnicos conviene una tabla `users`.

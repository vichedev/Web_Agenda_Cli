#!/usr/bin/env bash
# =============================================================================
#  Agenda de Soportes - instalador y administrador del servidor
#
#  Instalar (en el servidor):
#     git clone https://github.com/vichedev/Web_Agenda_Cli.git && cd Web_Agenda_Cli && ./install.sh
#  o directamente:
#     bash <(curl -fsSL https://raw.githubusercontent.com/vichedev/Web_Agenda_Cli/main/install.sh)
#
#  Comandos:  install (por defecto) | update | status | logs [servicio] | restart | stop | start
#             backup | restore <archivo.sql.gz> | uninstall | help
#  Sin preguntas (automatizado): ADMIN_USER=... ADMIN_PASSWORD=... [HTTP_PORT=..] [TZ_APP=..] [GROQ_API_KEY=..] ./install.sh
# =============================================================================
set -Eeuo pipefail

REPO_URL="${REPO_URL:-https://github.com/vichedev/Web_Agenda_Cli.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/Web_Agenda_Cli}"
ENV_FILE=".env.prod"
COMPOSE_FILE="docker-compose.prod.yml"

# ---------- Presentacion ----------
if [[ -t 1 ]]; then
  B=$'\033[1m'; D=$'\033[2m'; R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; C=$'\033[36m'; N=$'\033[0m'
else
  B=''; D=''; R=''; G=''; Y=''; C=''; N=''
fi
ok()    { printf '  %s[ ok ]%s %s\n' "$G" "$N" "$*"; }
info()  { printf '  %s[ .. ]%s %s\n' "$C" "$N" "$*"; }
warn()  { printf '  %s[warn]%s %s\n' "$Y" "$N" "$*"; }
die()   { printf '  %s[fail]%s %s\n' "$R" "$N" "$*" >&2; exit 1; }
step()  { printf '\n%s%s%s\n%s%s%s\n' "$B" "$*" "$N" "$D" "$(printf -- '-%.0s' $(seq 1 ${#1}))" "$N"; }

banner() {
  local line='+--------------------------------------------------+'
  printf '
  %s%s%s
' "$B" "$line" "$N"
  printf '  %s|%s %-48s %s|%s
' "$B" "$N" "" "$B" "$N"
  printf '  %s|%s   %s%-46s%s %s|%s
' "$B" "$N" "$B" "Agenda de Soportes" "$N" "$B" "$N"
  printf '  %s|%s   %s%-46s%s %s|%s
' "$B" "$N" "$D" "Instalador del servidor" "$N" "$B" "$N"
  printf '  %s|%s %-48s %s|%s
' "$B" "$N" "" "$B" "$N"
  printf '  %s%s%s

' "$B" "$line" "$N"
}

# Ejecuta un comando mostrando un indicador de progreso; si falla, muestra el final del registro.
run() {
  local msg="$1"; shift
  local log; log="$(mktemp)"
  if [[ ! -t 1 ]]; then
    info "$msg"
    "$@" >"$log" 2>&1 || { tail -n 40 "$log" >&2; rm -f "$log"; die "Fallo: $msg"; }
    rm -f "$log"; return
  fi
  "$@" >"$log" 2>&1 &
  local pid=$! i=0 frames='|/-\'
  while kill -0 "$pid" 2>/dev/null; do
    printf '\r  %s[ %s  ]%s %s' "$C" "${frames:i++%4:1}" "$N" "$msg"
    sleep 0.15
  done
  if wait "$pid"; then
    printf '\r  %s[ ok ]%s %s\033[K\n' "$G" "$N" "$msg"
  else
    printf '\r  %s[fail]%s %s\033[K\n' "$R" "$N" "$msg"
    tail -n 40 "$log" >&2; rm -f "$log"; exit 1
  fi
  rm -f "$log"
}

# ---------- Entrada de datos (funciona tambien con `curl | bash`) ----------
# HAS_TTY: hay a quien preguntar (terminal propia, o /dev/tty cuando el script llega por `curl | bash`).
HAS_TTY=0; TTY=/dev/stdin
if [[ -t 0 ]]; then HAS_TTY=1
elif { true </dev/tty; } 2>/dev/null; then HAS_TTY=1; TTY=/dev/tty; fi
ask() { # ask VAR "Pregunta" [por_defecto]
  local var="$1" q="$2" def="${3:-}" ans=''
  if [[ -n "${!var:-}" ]]; then return; fi
  if (( ! HAS_TTY )); then
    [[ $# -ge 3 ]] || die "Falta $var (sin terminal para preguntar)"
    printf -v "$var" '%s' "$def"; return
  fi
  read -r -p "  ${q}${def:+ [$def]}: " ans <"$TTY" || true
  printf -v "$var" '%s' "${ans:-$def}"
}
ask_secret() { # ask_secret VAR "Pregunta"
  local var="$1" q="$2" a='' b=''
  if [[ -n "${!var:-}" ]]; then return; fi
  (( HAS_TTY )) || die "Falta $var (sin terminal para preguntar)"
  while :; do
    read -r -s -p "  ${q}: " a <"$TTY"; echo
    [[ ${#a} -ge 8 ]] || { warn "Use al menos 8 caracteres."; continue; }
    [[ "$a" != *"'"* ]] || { warn "No use comillas simples (')."; continue; }
    read -r -s -p "  Repita la contraseña: " b <"$TTY"; echo
    [[ "$a" == "$b" ]] && break || warn "Las contraseñas no coinciden."
  done
  printf -v "$var" '%s' "$a"
}
confirm() { # confirm "Pregunta" [S|N por defecto]
  local def="${2:-S}" ans=''
  (( HAS_TTY )) || { [[ "$def" == S ]]; return; }
  read -r -p "  $1 [$([[ $def == S ]] && echo S/n || echo s/N)]: " ans <"$TTY" || true
  ans="${ans:-$def}"; [[ "$ans" =~ ^[SsYy]$ ]]
}
rand() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1" || true; }

# ---------- Arranque: asegurar que estamos dentro del proyecto ----------
bootstrap() {
  local src="${BASH_SOURCE[0]:-$0}"
  [[ -f "$src" ]] && cd "$(dirname "$src")"          # ejecutado como archivo: ir a su carpeta
  [[ -f "$COMPOSE_FILE" ]] && return 0
  # Ejecutado con `curl | bash` o fuera del proyecto: descargar el repositorio y continuar desde ahi.
  banner
  command -v git >/dev/null || die "Se necesita git para descargar el proyecto (apt install git)."
  step "Descargando el proyecto"
  if [[ -d "$INSTALL_DIR/.git" ]]; then run "Actualizando $INSTALL_DIR" git -C "$INSTALL_DIR" pull --ff-only
  else run "Clonando $REPO_URL" git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"; fi
  cd "$INSTALL_DIR"
  exec bash ./install.sh "$@"
}

# ---------- Docker ----------
SUDO=''
DC=()
ensure_docker() {
  step "Comprobando requisitos"
  [[ "$(uname -s)" == Linux ]] || warn "Pensado para Linux; en otros sistemas puede requerir ajustes."
  command -v curl >/dev/null || warn "curl no esta instalado: se omitira la comprobacion final de la API."

  if ! command -v docker >/dev/null; then
    warn "Docker no esta instalado."
    if confirm "¿Instalarlo ahora con el script oficial (get.docker.com)?"; then
      local priv=''
      if [[ $EUID -ne 0 ]]; then command -v sudo >/dev/null || die "Ejecute como root o instale sudo."; priv='sudo'; fi
      run "Instalando Docker" bash -c "curl -fsSL https://get.docker.com | $priv sh"
      $priv systemctl enable --now docker >/dev/null 2>&1 || true
    else
      die "Instale Docker y vuelva a ejecutar ./install.sh"
    fi
  fi
  if docker info >/dev/null 2>&1; then SUDO=''
  elif command -v sudo >/dev/null && sudo docker info >/dev/null 2>&1; then SUDO='sudo'; warn "Docker requiere sudo en este usuario (se usara sudo)."
  else die "No se puede hablar con el demonio de Docker. ¿Esta iniciado? (systemctl start docker)"; fi
  ok "Docker $($SUDO docker version --format '{{.Server.Version}}' 2>/dev/null || echo detectado)"

  $SUDO docker compose version >/dev/null 2>&1 || die "Falta el plugin 'docker compose' (v2). Instale docker-compose-plugin."
  ok "Docker Compose $($SUDO docker compose version --short 2>/dev/null)"
  DC=($SUDO docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
}

env_get() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d"'" -f2; }
need_env() { [[ -f "$ENV_FILE" ]] || die "No existe $ENV_FILE. Ejecute primero: ./install.sh"; }

port_in_use() {
  command -v ss >/dev/null || return 1
  ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"
}

# ---------- Configuracion ----------
configure() {
  step "Configuracion"
  if [[ -f "$ENV_FILE" ]]; then
    ok "Se encontro $ENV_FILE"
    if ! confirm "¿Reutilizar la configuracion existente?"; then rm -f "$ENV_FILE"; fi
  fi
  [[ -f "$ENV_FILE" ]] && return

  printf '  %sCuenta de administrador de la web%s\n' "$D" "$N"
  ask ADMIN_USER "Usuario" "admin"
  [[ "$ADMIN_USER" != *"'"* && -n "$ADMIN_USER" ]] || die "Usuario invalido."
  ask_secret ADMIN_PASSWORD "Contraseña"
  [[ ${#ADMIN_PASSWORD} -ge 8 && "$ADMIN_PASSWORD" != *"'"* ]] || die "La contraseña debe tener al menos 8 caracteres y no contener comillas simples (')."
  printf '\n  %sRed y zona horaria%s\n' "$D" "$N"
  ask HTTP_PORT "Puerto HTTP publico" "80"
  [[ "$HTTP_PORT" =~ ^[0-9]+$ ]] || die "Puerto invalido."
  if port_in_use "$HTTP_PORT"; then warn "El puerto $HTTP_PORT parece estar en uso; si falla, elija otro."; fi
  ask TZ_APP "Zona horaria" "America/Guayaquil"
  printf '\n  %sInteligencia artificial (opcional)%s\n' "$D" "$N"
  ask GROQ_API_KEY "API key de Groq (Enter para configurarla luego en la web)" ""

  ( umask 077
    cat > "$ENV_FILE" <<EOF
ADMIN_USER='${ADMIN_USER}'
ADMIN_PASSWORD='${ADMIN_PASSWORD}'
JWT_SECRET='$(rand 64)'
POSTGRES_PASSWORD='$(rand 32)'
HTTP_PORT='${HTTP_PORT}'
TZ_APP='${TZ_APP}'
GROQ_API_KEY='${GROQ_API_KEY:-}'
EOF
  )
  chmod 600 "$ENV_FILE"
  ok "Configuracion guardada en $ENV_FILE (permisos 600; no se sube a git)"
}

wait_api() {
  command -v curl >/dev/null || return 0
  local port code i; port="$(env_get HTTP_PORT)"
  for i in $(seq 1 60); do
    code="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' "http://127.0.0.1:${port}/api/auth/login" || true)"
    [[ "$code" == 400 ]] && return 0
    sleep 2
  done
  return 1
}

deploy() {
  step "Construyendo y levantando los servicios"
  info "La primera vez tarda unos minutos (descarga imagenes y compila)."
  if "${DC[@]}" up --help 2>/dev/null | grep -q -- '--wait'; then
    run "Construyendo imagenes y arrancando (base de datos, API, web)" "${DC[@]}" up -d --build --wait --wait-timeout 240
  else
    run "Construyendo imagenes y arrancando (base de datos, API, web)" "${DC[@]}" up -d --build
  fi
  info "Si tarda demasiado, revise: ./install.sh logs server"
  run "Esperando a que la API responda" wait_api
}

summary() {
  local ip port url
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"; ip="${ip:-IP-DEL-SERVIDOR}"
  port="$(env_get HTTP_PORT)"; url="http://${ip}$([[ "$port" == 80 ]] || echo ":$port")"
  printf '\n%s' "$G$B"
  printf '  Instalacion completada\n'
  printf '%s\n' "$N"
  printf '  %sAcceso%s        %s\n' "$B" "$N" "$url"
  printf '  %sUsuario%s       %s\n' "$B" "$N" "$(env_get ADMIN_USER)"
  printf '\n  %sSiguientes pasos%s\n' "$B" "$N"
  printf '   1. Entre a la web con el usuario y la contraseña elegidos.\n'
  printf '   2. Configuracion > WhatsApp: escanee el QR con el telefono del bot.\n'
  printf '   3. Configuracion > Mis numeros: agregue su numero (solo a esos numeros responde el bot).\n'
  [[ -n "$(env_get GROQ_API_KEY)" ]] || printf '   4. Configuracion > Inteligencia artificial: pegue su API key de Groq.\n'
  printf '\n  %sAdministracion%s\n' "$B" "$N"
  printf '   ./install.sh status | logs | update | backup | restart | stop | uninstall\n'
  printf '\n  %sRecomendado%s\n' "$B" "$N"
  printf '   Sirva la web con HTTPS (Caddy, Nginx o Cloudflare) y limite el acceso con firewall;\n'
  printf '   la sesion y la contraseña viajan por la red.\n\n'
}

# ---------- Comandos ----------
cmd_install() { banner; ensure_docker; configure; deploy; summary; }

cmd_update() {
  banner; need_env; ensure_docker
  step "Actualizando"
  if [[ -d .git ]]; then run "Descargando la ultima version" git pull --ff-only; else warn "No es un clon de git: se reconstruye con los archivos actuales."; fi
  deploy
  ok "Actualizado. Los datos y la sesion de WhatsApp se conservan."
}
cmd_status()  { need_env; ensure_docker >/dev/null; "${DC[@]}" ps; }
cmd_logs()    { need_env; ensure_docker >/dev/null; "${DC[@]}" logs -f --tail=100 "$@"; }
cmd_restart() { banner; need_env; ensure_docker >/dev/null; run "Reiniciando servicios" "${DC[@]}" restart; ok "Listo"; }
cmd_stop()    { need_env; ensure_docker >/dev/null; run "Deteniendo servicios" "${DC[@]}" stop; ok "Detenido (los datos se conservan). Para iniciar: ./install.sh start"; }
cmd_start()   { need_env; ensure_docker >/dev/null; run "Iniciando servicios" "${DC[@]}" up -d; ok "En marcha"; }

cmd_backup() {
  need_env; ensure_docker >/dev/null
  mkdir -p backups
  local f="backups/agenda-$(date +%Y%m%d-%H%M%S).sql.gz"
  step "Copia de seguridad"
  "${DC[@]}" exec -T db pg_dump -U agenda --clean --if-exists agenda | gzip > "$f"
  [[ -s "$f" ]] || { rm -f "$f"; die "La copia salio vacia."; }
  ok "Guardada en $f ($(du -h "$f" | cut -f1))"
  info "La sesion de WhatsApp vive en el volumen 'waauth'; si la pierde solo debe escanear el QR de nuevo."
}

cmd_restore() {
  local f="${1:-}"; [[ -f "$f" ]] || die "Uso: ./install.sh restore backups/archivo.sql.gz"
  need_env; ensure_docker >/dev/null
  warn "Esto REEMPLAZA los datos actuales por los de $f."
  confirm "¿Continuar?" N || { info "Cancelado."; exit 0; }
  run "Deteniendo la API" "${DC[@]}" stop server
  gunzip -c "$f" | "${DC[@]}" exec -T db psql -U agenda -d agenda -v ON_ERROR_STOP=1 >/dev/null || { "${DC[@]}" start server >/dev/null; die "La restauracion fallo; se reinicio la API sin cambios completos."; }
  run "Iniciando la API" "${DC[@]}" start server
  ok "Restauracion completada."
}

cmd_uninstall() {
  need_env; ensure_docker >/dev/null
  step "Desinstalar"
  warn "Se detendran y eliminaran los contenedores."
  confirm "¿Continuar?" N || { info "Cancelado."; exit 0; }
  if confirm "¿Borrar tambien los DATOS (base de datos y sesion de WhatsApp)? No se puede deshacer." N; then
    local w=''; read -r -p "  Escriba BORRAR para confirmar: " w <"$TTY" || true
    [[ "$w" == BORRAR ]] || die "Confirmacion incorrecta; no se borro nada."
    run "Eliminando contenedores y datos" "${DC[@]}" down -v --remove-orphans
  else
    run "Eliminando contenedores (se conservan los datos)" "${DC[@]}" down --remove-orphans
  fi
  ok "Listo."
}

cmd_help() { sed -n '2,13p' "${BASH_SOURCE[0]:-$0}" | sed 's/^# \{0,1\}//'; }

main() {
  bootstrap "$@"
  case "${1:-install}" in
    install)   cmd_install ;;
    update)    cmd_update ;;
    status)    cmd_status ;;
    logs)      shift; cmd_logs "$@" ;;
    restart)   cmd_restart ;;
    stop)      cmd_stop ;;
    start)     cmd_start ;;
    backup)    cmd_backup ;;
    restore)   shift; cmd_restore "$@" ;;
    uninstall) cmd_uninstall ;;
    help|-h|--help) cmd_help ;;
    *) cmd_help; exit 1 ;;
  esac
}

# Se ejecuta solo si se invoca el script (no si se importa con `source`).
if [[ -z "${BASH_SOURCE[0]:-}" || "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi

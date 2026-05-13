#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

ADMIN_PIN="${ADMIN_PIN:-}"
PUBLIC_IP="${PUBLIC_IP:-}"
PORT="${PORT:-3000}"
QR_SIZE="${QR_SIZE:-512}"
USE_EXTERNAL_IP=0
KEEP_EXISTING=0
NO_BUILD=0
NO_QR=0
NO_START=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --admin-pin)
      ADMIN_PIN="${2:-}"
      shift 2
      ;;
    --public-ip)
      PUBLIC_IP="${2:-}"
      shift 2
      ;;
    --port)
      PORT="${2:-3000}"
      shift 2
      ;;
    --qr-size)
      QR_SIZE="${2:-512}"
      shift 2
      ;;
    --use-external-ip)
      USE_EXTERNAL_IP=1
      shift
      ;;
    --keep-existing)
      KEEP_EXISTING=1
      shift
      ;;
    --no-build)
      NO_BUILD=1
      shift
      ;;
    --no-qr)
      NO_QR=1
      shift
      ;;
    --no-start)
      NO_START=1
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

if [ -z "$ADMIN_PIN" ]; then
  ADMIN_PIN="$(LC_ALL=C tr -dc 'A-HJ-NP-Za-km-z2-9' </dev/urandom | head -c 16)"
fi

if [ "${#ADMIN_PIN}" -lt 8 ]; then
  echo "Admin pin must be at least 8 characters."
  exit 1
fi

is_private_ipv4() {
  case "$1" in
    10.*|192.168.*|172.16.*|172.17.*|172.18.*|172.19.*|172.20.*|172.21.*|172.22.*|172.23.*|172.24.*|172.25.*|172.26.*|172.27.*|172.28.*|172.29.*|172.30.*|172.31.*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

get_local_public_ip() {
  local ip
  while IFS= read -r ip; do
    [ -z "$ip" ] && continue
    case "$ip" in
      127.*|169.254.*) continue ;;
    esac
    if ! is_private_ipv4 "$ip"; then
      echo "$ip"
      return 0
    fi
  done < <(ifconfig | awk '/inet / { print $2 }')
  return 1
}

get_private_ip() {
  local ip
  while IFS= read -r ip; do
    [ -z "$ip" ] && continue
    case "$ip" in
      127.*|169.254.*) continue ;;
    esac
    echo "$ip"
    return 0
  done < <(ifconfig | awk '/inet / { print $2 }')
  return 1
}

get_external_ip() {
  curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true
}

resolve_display_ip() {
  if [ -n "$PUBLIC_IP" ]; then
    echo "$PUBLIC_IP|manual --public-ip"
    return 0
  fi

  if [ "$USE_EXTERNAL_IP" -eq 0 ]; then
    local local_public
    local_public="$(get_local_public_ip || true)"
    if [ -n "$local_public" ]; then
      echo "$local_public|local public network adapter"
      return 0
    fi
  fi

  local external
  external="$(get_external_ip || true)"
  if [ -n "$external" ]; then
    echo "$external|external public IP lookup"
    return 0
  fi

  local private_ip
  private_ip="$(get_private_ip || true)"
  if [ -n "$private_ip" ]; then
    echo "$private_ip|private LAN adapter fallback"
    return 0
  fi

  echo "No usable IPv4 address was found." >&2
  exit 1
}

urlencode() {
  node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" "$1"
}

save_qr_code() {
  local text="$1"
  local out_file="$2"
  local encoded
  encoded="$(urlencode "$text")"
  local api_url="https://api.2dcode.biz/v1/create-qr-code?data=${encoded}&size=${QR_SIZE}x${QR_SIZE}&format=png&error_correction=H&border=2"
  curl -fsSL "$api_url" -o "$out_file"
  echo "$api_url"
}

test_app_build_ready() {
  [ -f "$ROOT_DIR/app/package.json" ] && [ -d "$ROOT_DIR/app/node_modules" ] && [ -d "$ROOT_DIR/app/src" ]
}

test_built_frontend() {
  [ -f "$ROOT_DIR/app/dist/index.html" ]
}

get_port_pids() {
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | sort -u || true
}

get_local_health() {
  curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/api/health" 2>/dev/null || true
}

RESOLVED="$(resolve_display_ip)"
DISPLAY_IP="${RESOLVED%%|*}"
IP_SOURCE="${RESOLVED#*|}"
AUDIENCE_URL="http://${DISPLAY_IP}:${PORT}/"
ADMIN_URL="http://${DISPLAY_IP}:${PORT}/admin?pin=${ADMIN_PIN}"
QR_DIR="$ROOT_DIR/data/qrcodes"
AUDIENCE_QR="$QR_DIR/audience.png"
ADMIN_QR="$QR_DIR/admin.png"
URLS_FILE="$QR_DIR/show-urls.txt"

if [ "$NO_BUILD" -eq 0 ]; then
  if test_app_build_ready; then
    echo "Building audience/admin frontend..."
    npm --prefix app run build
  elif test_built_frontend; then
    echo "Using prebuilt frontend from app/dist."
  else
    echo "Frontend is not buildable here and app/dist/index.html was not found."
    exit 1
  fi
fi

AUDIENCE_QR_API=""
ADMIN_QR_API=""
if [ "$NO_QR" -eq 0 ]; then
  mkdir -p "$QR_DIR"
  echo "Generating QR codes with cli.im API..."
  AUDIENCE_QR_API="$(save_qr_code "$AUDIENCE_URL" "$AUDIENCE_QR")"
  ADMIN_QR_API="$(save_qr_code "$ADMIN_URL" "$ADMIN_QR")"
  {
    echo "Audience URL: $AUDIENCE_URL"
    echo "Admin URL:    $ADMIN_URL"
    echo "Audience QR:  $AUDIENCE_QR"
    echo "Admin QR:     $ADMIN_QR"
    echo "Audience QR API: $AUDIENCE_QR_API"
    echo "Admin QR API:    $ADMIN_QR_API"
  } > "$URLS_FILE"
fi

echo
echo "FY show service is ready."
echo "Running IP:   $DISPLAY_IP"
echo "IP source:    $IP_SOURCE"
echo "Bind address: 0.0.0.0:${PORT}"
echo "Audience URL: $AUDIENCE_URL"
echo "Admin URL:    $ADMIN_URL"
if [ "$NO_QR" -eq 0 ]; then
  echo "Audience QR:  $AUDIENCE_QR"
  echo "Admin QR:     $ADMIN_QR"
  echo "URL record:   $URLS_FILE"
fi
echo
echo "Do not share the admin URL or admin QR with audiences."
echo "Press Ctrl+C in this Terminal window to stop the service."
echo

if [ "$NO_START" -eq 1 ]; then
  echo "No-start was set, so the backend was not started."
  exit 0
fi

PORT_PIDS="$(get_port_pids)"
if [ -n "$PORT_PIDS" ]; then
  HEALTH="$(get_local_health)"
  if [ "$KEEP_EXISTING" -eq 1 ] && echo "$HEALTH" | grep -q '"ok":true'; then
    echo "Port ${PORT} is already occupied by a running FY show server."
    echo "Keep-existing was set. The service is already available at the URLs printed above."
    exit 0
  fi

  if echo "$HEALTH" | grep -q '"ok":true'; then
    echo "Port ${PORT} is already in use by an FY show server. Stopping it before starting a fresh one..."
    echo "$PORT_PIDS" | xargs kill -TERM 2>/dev/null || true
    sleep 1
    if [ -n "$(get_port_pids)" ]; then
      echo "$PORT_PIDS" | xargs kill -KILL 2>/dev/null || true
      sleep 1
    fi
    if [ -n "$(get_port_pids)" ]; then
      echo "Port ${PORT} is still in use after restart attempt."
      exit 1
    fi
  else
    echo "Port ${PORT} is already in use by another process:"
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN || true
    echo "Stop that process first or use --port."
    exit 1
  fi
fi

if [ ! -d "$ROOT_DIR/server/node_modules" ]; then
  echo "Installing server runtime dependencies..."
  npm --prefix server install --omit=dev
fi

export HOST="0.0.0.0"
export PORT="$PORT"
export ADMIN_PIN="$ADMIN_PIN"
npm --prefix server start

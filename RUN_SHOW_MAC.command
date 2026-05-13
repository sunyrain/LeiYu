#!/bin/bash
set -u

cd "$(dirname "$0")"

echo "Fangyi 2026 show launcher for macOS"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found."
  echo "Install Node.js 20 or newer from https://nodejs.org/ and run this file again."
  echo
  read -r -p "Press Enter to close this window..."
  exit 1
fi

NODE_MAJOR="$(node -p "parseInt(process.versions.node.split('.')[0], 10)" 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20 or newer is required. Current version: $(node -v)"
  echo "Install a newer Node.js from https://nodejs.org/ and run this file again."
  echo
  read -r -p "Press Enter to close this window..."
  exit 1
fi

ADMIN_PIN_VALUE="${ADMIN_PIN:-LeiYu2026Check}"

bash ./start-one-click-mac.sh --admin-pin "$ADMIN_PIN_VALUE"
STATUS=$?

echo
if [ "$STATUS" -eq 0 ]; then
  echo "The show service stopped."
else
  echo "The show service failed to start or stopped with an error."
fi
echo "Check the messages above."
read -r -p "Press Enter to close this window..."
exit "$STATUS"

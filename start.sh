#!/data/data/com.termux/files/usr/bin/bash
# MYDAN — mobile launcher for Termux on Android.
# Sets up on first run, then just starts the server on every run after that.

cd "$(dirname "$0")" || exit 1

GOLD='\033[1;33m'; DIM='\033[2m'; OK='\033[0;32m'; ERR='\033[0;31m'; OFF='\033[0m'

echo ""
echo -e "${GOLD}   ███  MYDAN / میدان  ███${OFF}"
echo -e "${DIM}   Global Trade Marketplace — mobile edition${OFF}"
echo ""

# --- Node.js present? ---
if ! command -v node >/dev/null 2>&1; then
  echo -e "${ERR}Node.js is not installed.${OFF}"
  echo "Run this first:"
  echo -e "   ${GOLD}pkg install nodejs -y${OFF}"
  echo ""
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo -e "${ERR}Node.js 18 or newer is required (found $(node -v)).${OFF}"
  echo -e "   ${GOLD}pkg upgrade nodejs${OFF}"
  echo ""
  exit 1
fi

# --- first-run install ---
if [ ! -d node_modules ]; then
  echo -e "${DIM}First run — installing dependencies (1-3 minutes, needs internet)...${OFF}"
  npm install --omit=dev --no-audit --no-fund || {
    echo -e "${ERR}Install failed. Check your internet connection and try again.${OFF}"; exit 1; }
  echo -e "${OK}Dependencies installed.${OFF}"
  echo ""
fi

# --- first-run database ---
if [ ! -f data/mydan.sqlite ]; then
  echo -e "${DIM}Building the database and loading sample data...${OFF}"
  node src/db/seed.js || { echo -e "${ERR}Seeding failed.${OFF}"; exit 1; }
  echo ""
fi

# --- find the LAN address so other devices can connect too ---
PORT="${PORT:-3000}"
LAN=$(ip route get 1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1); exit}')
[ -z "$LAN" ] && LAN=$(ifconfig 2>/dev/null | grep -Eo 'inet (addr:)?([0-9]+\.){3}[0-9]+' \
    | grep -v '127.0.0.1' | head -1 | awk '{print $NF}')

echo -e "${OK}Starting the marketplace...${OFF}"
echo ""
echo -e "   On this phone:  ${GOLD}http://localhost:${PORT}${OFF}"
[ -n "$LAN" ] && echo -e "   Same Wi-Fi:     ${GOLD}http://${LAN}:${PORT}${OFF}"
echo ""
echo -e "${DIM}   Admin  +905000000001${OFF}"
echo -e "${DIM}   Seller +905000000010${OFF}"
echo -e "${DIM}   Buyer  +905000000032${OFF}"
echo -e "${DIM}   Password for all: Mydan!2026${OFF}"
echo ""
echo -e "${DIM}   Press Ctrl+C to stop.${OFF}"
echo ""

exec node server.js

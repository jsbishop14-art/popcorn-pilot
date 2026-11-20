#!/bin/bash
# Popcorn Pilot hub install for a Mac (PP7). Guide: docs/install-mac.md.
#   sudo bash scripts/install-mac.sh            install (safe to run again: it keeps what is already there)
#   bash scripts/install-mac.sh --dry-run       print every step without changing anything
# Sets up, and changes nothing else on the Mac:
#   - the app and data folders under /Library/PopcornPilot (owned by the Mac user who ran the install, closed to
#     other users)
#   - its own copy of Node 20 in that folder, not a system-wide install
#   - the app, built, with its database (migrations) and the secret store key
#   - a launchd daemon (com.popcornpilot.hub) that starts the hub when the Mac starts, before anyone logs in, and
#     starts it again if it stops; inside the hub: the nightly backup (3:00 AM) and the updater (4:00 AM and Check
#     for updates now)
#   - when the macOS firewall is on: the hub's Node copy allowed to accept connections (removed by the uninstall)
# No power, sleep, network or DNS setting is changed. Ad blocking is not installed on a Mac.
# Uninstall: sudo bash scripts/uninstall-mac.sh (keeps the data folder unless --remove-data).
# Test mode (CI): --test --root DIR --repo PATH --branch NAME --node-dir DIR: label com.popcornpilot.hub.test, Node
# copied from --node-dir instead of downloaded.
set -euo pipefail

REPO_URL="https://github.com/jsbishop14-art/popcorn-pilot.git"
BRANCH="main"
ROOT="/Library/PopcornPilot"
PORT="8765"
NODE_SRC=""
LABEL="com.popcornpilot.hub"
DRY_RUN=0
TEST_MODE=0

usage() {
  echo "usage: install-mac.sh [--dry-run] [--port N] [--root DIR] [--repo URL] [--branch NAME] [--test] [--node-dir DIR]"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --port) PORT="$2"; shift ;;
    --root) ROOT="$2"; shift ;;
    --repo) REPO_URL="$2"; shift ;;
    --branch) BRANCH="$2"; shift ;;
    --node-dir) NODE_SRC="$2"; shift ;;
    --test) TEST_MODE=1; LABEL="com.popcornpilot.hub.test" ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
  shift
done

APP_DIR="$ROOT/app"
DATA_DIR="$ROOT/data"
NODE_HOME="$ROOT/node"
LOG_DIR="$ROOT/logs"
NPM_CACHE="$ROOT/npm-cache"
KEY_FILE="$DATA_DIR/master.key"
CONFIG="$ROOT/hub.json"
RECORD="$ROOT/install.json"
PLIST="/Library/LaunchDaemons/$LABEL.plist"
NODE="$NODE_HOME/bin/node"
NPM="$NODE_HOME/bin/npm"
FW="/usr/libexec/ApplicationFirewall/socketfilterfw"

say() { printf '\n== %s\n' "$*"; }

# Run a command, or print it in a dry run.
run() {
  if [ "$DRY_RUN" = 1 ]; then
    printf '  [dry run] %s\n' "$*"
  else
    "$@"
  fi
}

# Run a command as the Mac user the hub runs as, with the hub's folders and its Node and Git first on the PATH.
as_user() {
  run sudo -u "$RUN_USER" env HOME="$USER_HOME" PATH="$NODE_HOME/bin:$(dirname "$GIT"):/usr/bin:/bin:/usr/sbin:/sbin" \
    PP_HOST=mac PP_DATA_DIR="$DATA_DIR" PP_MASTER_KEY_FILE="$KEY_FILE" NEXT_TELEMETRY_DISABLED=1 \
    npm_config_cache="$NPM_CACHE" npm_config_update_notifier=false npm_config_fund=false "$@"
}

# Write a file from standard input, or show it in a dry run.
write_file() { # path mode owner
  if [ "$DRY_RUN" = 1 ]; then
    printf '  [dry run] write %s (mode %s, owner %s):\n' "$1" "$2" "$3"
    sed 's/^/      /'
  else
    local tmp
    tmp="$(mktemp)"
    cat > "$tmp"
    install -m "$2" -o "${3%%:*}" -g "${3##*:}" "$tmp" "$1"
    rm -f "$tmp"
  fi
}

say "Checking this is a Mac, run with sudo"
if [ "$(uname -s)" != Darwin ]; then
  if [ "$DRY_RUN" = 1 ]; then
    echo "  (this machine is $(uname -s), not a Mac. Continuing because this is a dry run.)"
  else
    echo "This is the Mac install. On a Raspberry Pi use scripts/install-pi.sh; on Windows scripts/install-windows.ps1." >&2
    exit 1
  fi
fi
if [ "$DRY_RUN" = 0 ] && [ "$(id -u)" != 0 ]; then
  echo "Run it with sudo: sudo bash scripts/install-mac.sh" >&2
  exit 1
fi
RUN_USER="${SUDO_USER:-}"
if [ -z "$RUN_USER" ] || [ "$RUN_USER" = root ]; then
  if [ "$DRY_RUN" = 1 ]; then
    RUN_USER="$(id -un)"
  else
    echo "Run it with sudo from your own Mac account (not as root): the hub runs as that account." >&2
    exit 1
  fi
fi
RUN_GROUP="$(id -gn "$RUN_USER")"
USER_HOME="$(eval echo "~$RUN_USER")"
case "$(uname -m)" in
  arm64) NODE_ARCH=arm64 ;;
  *) NODE_ARCH=x64 ;;
esac
echo "  $(uname -s) $(uname -m), hub account $RUN_USER, app folder $ROOT, port $PORT"

say "Checking Git (used to get the app and by the updater)"
GIT="$(command -v git || true)"
if [ -z "$GIT" ] || ! git --version >/dev/null 2>&1; then
  echo "Git is not installed. Run: xcode-select --install   then run this install again." >&2
  exit 1
fi
echo "  $(git --version)"

say "Creating the app and data folders"
run install -d -m 0700 -o "$RUN_USER" -g "$RUN_GROUP" "$ROOT" "$DATA_DIR" "$DATA_DIR/backups" "$LOG_DIR" "$NPM_CACHE"

say "Getting Node 20 (a copy for the hub only, in the app folder)"
if [ -x "$NODE" ] && "$NODE" -v | grep -q '^v20\.'; then
  echo "  Node $("$NODE" -v) is already in $NODE_HOME"
elif [ -n "$NODE_SRC" ]; then
  run rm -rf "$NODE_HOME"
  run cp -R "$NODE_SRC" "$NODE_HOME"
  run chown -R "$RUN_USER:$RUN_GROUP" "$NODE_HOME"
else
  base="https://nodejs.org/dist/latest-v20.x"
  if [ "$DRY_RUN" = 1 ]; then
    echo "  [dry run] download Node 20 (darwin-$NODE_ARCH) from $base and check it against SHASUMS256.txt"
  else
    tmp="$(mktemp -d)"
    curl -fsSL "$base/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
    line="$(grep -E " node-v20\.[0-9.]+-darwin-$NODE_ARCH\.tar\.gz$" "$tmp/SHASUMS256.txt" | head -n 1)"
    if [ -z "$line" ]; then
      echo "Node 20 for darwin-$NODE_ARCH was not found at $base" >&2
      exit 1
    fi
    file="${line##* }"
    curl -fsSL "$base/$file" -o "$tmp/$file"
    (cd "$tmp" && printf '%s\n' "$line" | shasum -a 256 -c -) || { echo "The Node download does not match its checksum." >&2; exit 1; }
    rm -rf "$NODE_HOME"
    mkdir -p "$NODE_HOME"
    tar -xzf "$tmp/$file" -C "$NODE_HOME" --strip-components 1
    chown -R "$RUN_USER:$RUN_GROUP" "$NODE_HOME"
    rm -rf "$tmp"
  fi
fi
if [ "$DRY_RUN" = 0 ]; then
  v="$("$NODE" -v)"
  case "$v" in
    v20.*) echo "  Node $v" ;;
    *) echo "The hub needs Node 20; $NODE is $v." >&2; exit 1 ;;
  esac
fi

say "Creating the secret store key"
if [ -f "$KEY_FILE" ]; then
  echo "  key exists; keeping it (PINs and secrets depend on it)"
elif [ "$DRY_RUN" = 1 ]; then
  echo "  [dry run] write $KEY_FILE: 32 random bytes as hex (mode 0600, owner $RUN_USER)"
else
  od -An -tx1 -N32 /dev/urandom | tr -d ' \n' | write_file "$KEY_FILE" 0600 "$RUN_USER:$RUN_GROUP"
fi

say "Stopping the hub while it is set up (if it is running)"
if launchctl print "system/$LABEL" >/dev/null 2>&1; then
  run launchctl bootout "system/$LABEL" || true
else
  echo "  not running"
fi

say "Getting the app"
if [ -d "$APP_DIR/.git" ]; then
  echo "  $APP_DIR already has the app; the updater keeps it current"
else
  as_user git clone --quiet --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

say "Installing, building and setting up the database"
run cd "$APP_DIR"
as_user "$NPM" ci --no-audit --no-fund
as_user "$NPM" run build
as_user "$NODE" scripts/migrate.mjs

say "Writing the hub settings"
write_file "$CONFIG" 0600 "$RUN_USER:$RUN_GROUP" <<JSON
{
  "host": "mac",
  "port": $PORT,
  "appDir": "$APP_DIR",
  "dataDir": "$DATA_DIR",
  "keyFile": "$KEY_FILE",
  "logDir": "$LOG_DIR",
  "npmCache": "$NPM_CACHE",
  "git": "$GIT",
  "pathDirs": ["$NODE_HOME/bin", "$(dirname "$GIT")"]
}
JSON

say "Setting up the launchd daemon $LABEL (starts with the Mac, before anyone logs in)"
write_file "$PLIST" 0644 root:wheel <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$APP_DIR/scripts/hub-service.mjs</string>
    <string>--config</string>
    <string>$CONFIG</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$APP_DIR</string>
  <key>UserName</key>
  <string>$RUN_USER</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$USER_HOME</string>
    <key>PATH</key>
    <string>/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/launchd.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/launchd.log</string>
</dict>
</plist>
PLIST
run plutil -lint "$PLIST"

say "Allowing the hub through the macOS firewall (only if the firewall is on)"
if [ -x "$FW" ] && "$FW" --getglobalstate 2>/dev/null | grep -q 'enabled'; then
  run "$FW" --add "$NODE"
  run "$FW" --unblockapp "$NODE"
  FW_ADDED=true
else
  echo "  the macOS firewall is off; nothing to add"
  FW_ADDED=false
fi

say "Recording what was installed (for the uninstall)"
write_file "$RECORD" 0600 "$RUN_USER:$RUN_GROUP" <<JSON
{
  "at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "root": "$ROOT",
  "dataDir": "$DATA_DIR",
  "label": "$LABEL",
  "plist": "$PLIST",
  "user": "$RUN_USER",
  "port": $PORT,
  "firewallApp": $FW_ADDED,
  "testMode": $([ "$TEST_MODE" = 1 ] && echo true || echo false)
}
JSON

say "Starting the hub and checking it answers"
run launchctl bootstrap system "$PLIST"
as_user env PORT="$PORT" SMOKE_TIMEOUT=180 "$NODE" scripts/smoke.mjs

say "Done"
ip="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
[ -n "$ip" ] || ip="<this Mac's address>"
echo "Open http://$ip:$PORT on a phone or computer on the home Wi-Fi and set the Adult PIN and the Guest PIN."
echo "Settings > Hub in the app shows this address and a QR code to open it on a phone."
echo "While this Mac sleeps or is off, kid limits, snap back, schedules and routines pause until it is back (docs/install-mac.md step 4)."

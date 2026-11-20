#!/usr/bin/env bash
# Popcorn Pilot hub install for a fresh Raspberry Pi OS 64-bit (Raspberry Pi 5). Guide: docs/install-pi.md.
#   sudo bash scripts/install-pi.sh            install (safe to run again: it skips what is already done)
#   bash scripts/install-pi.sh --dry-run       print every step without changing anything
# Installs: Node 20, the app under /opt/popcorn-pilot as the service user "popcorn", the database and backups under
# /var/lib/popcorn-pilot, the secret store key under /etc/popcorn-pilot, the app service (starts on boot), the
# nightly backup, the updater (daily, plus Check for updates now), and ad blocking (AdGuard Home, PP5).
set -euo pipefail

REPO_URL="https://github.com/jsbishop14-art/popcorn-pilot.git"
APP_DIR="/opt/popcorn-pilot"
DATA_DIR="/var/lib/popcorn-pilot"
ETC_DIR="/etc/popcorn-pilot"
SVC_USER="popcorn"
PORT="80"
DRY_RUN=0

usage() {
  echo "usage: install-pi.sh [--dry-run] [--repo URL] [--port N]"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --repo) REPO_URL="$2"; shift ;;
    --port) PORT="$2"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
  shift
done

say() { printf '\n== %s\n' "$*"; }

# Run a command, or print it in a dry run.
run() {
  if [ "$DRY_RUN" = 1 ]; then
    printf '  [dry run] %s\n' "$*"
  else
    "$@"
  fi
}

# Run a command as the service user.
as_svc() {
  run runuser -u "$SVC_USER" -- env PP_DATA_DIR="$DATA_DIR" PP_MASTER_KEY_FILE="$ETC_DIR/master.key" NEXT_TELEMETRY_DISABLED=1 "$@"
}

# Write a file from standard input, or show where it would go in a dry run.
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

say "Checking this is a Raspberry Pi OS 64-bit machine"
arch="$(uname -m)"
if [ "$arch" != "aarch64" ]; then
  if [ "$DRY_RUN" = 1 ]; then
    echo "  (this machine is $arch; the Pi is aarch64. Continuing because this is a dry run.)"
  else
    echo "This needs a 64-bit Raspberry Pi OS (aarch64); this machine is $arch." >&2
    exit 1
  fi
fi
if [ "$DRY_RUN" = 0 ] && [ "$(id -u)" != 0 ]; then
  echo "Run it with sudo: sudo bash scripts/install-pi.sh" >&2
  exit 1
fi

say "Installing system packages"
run apt-get update
run apt-get install -y git curl ca-certificates gnupg build-essential python3 sqlite3 util-linux sudo

say "Installing Node 20"
if command -v node >/dev/null 2>&1 && node -v | grep -q '^v20\.'; then
  echo "  Node $(node -v) is already installed"
else
  run install -d -m 0755 /etc/apt/keyrings
  if [ "$DRY_RUN" = 1 ]; then
    echo "  [dry run] curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg"
  else
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  fi
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" |
    write_file /etc/apt/sources.list.d/nodesource.list 0644 root:root
  run apt-get update
  run apt-get install -y nodejs
fi

say "Creating the service user and folders"
if id "$SVC_USER" >/dev/null 2>&1; then
  echo "  user $SVC_USER exists"
else
  run useradd --system --home-dir "$DATA_DIR" --no-create-home --shell /usr/sbin/nologin "$SVC_USER"
fi
run install -d -m 0750 -o "$SVC_USER" -g "$SVC_USER" "$DATA_DIR" "$DATA_DIR/backups"
run install -d -m 0755 -o "$SVC_USER" -g "$SVC_USER" "$APP_DIR"
run install -d -m 0750 -o root -g "$SVC_USER" "$ETC_DIR"

say "Creating the secret store key"
if [ -f "$ETC_DIR/master.key" ]; then
  echo "  key exists; keeping it (PINs and secrets depend on it)"
else
  if [ "$DRY_RUN" = 1 ]; then
    echo "  [dry run] write $ETC_DIR/master.key: 32 random bytes as hex (mode 0600, owner $SVC_USER)"
  else
    od -An -tx1 -N32 /dev/urandom | tr -d ' \n' | write_file "$ETC_DIR/master.key" 0600 "$SVC_USER:$SVC_USER"
  fi
fi
write_file "$ETC_DIR/env" 0640 "root:$SVC_USER" <<ENV
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
PORT=$PORT
PP_DATA_DIR=$DATA_DIR
PP_MASTER_KEY_FILE=$ETC_DIR/master.key
PP_APP_DIR=$APP_DIR
ENV

say "Getting the app"
if [ -d "$APP_DIR/.git" ]; then
  echo "  $APP_DIR already has the app; the updater keeps it current"
else
  run runuser -u "$SVC_USER" -- git clone --branch main "$REPO_URL" "$APP_DIR"
fi

say "Installing, building and setting up the database"
run cd "$APP_DIR"
as_svc npm ci --no-audit --no-fund
as_svc npm run build
as_svc node scripts/migrate.mjs

say "Installing ad blocking (AdGuard Home)"
# AdGuard Home (free, open source) answers the home network's DNS and blocks Roku home screen ads and tracking. Its
# admin page listens only on this Pi (127.0.0.1:3053); the hub reads it with a login only the hub knows, left in
# the data folder for the hub to move into its secret store. Josh then points the router's DNS at this Pi
# (docs/install-pi.md step 8).
AGH_DIR="/opt/AdGuardHome"
AGH_URL="https://static.adguard.com/adguardhome/release/AdGuardHome_linux_arm64.tar.gz"
if [ -x "$AGH_DIR/AdGuardHome" ]; then
  echo "  AdGuard Home is already installed; keeping its settings"
else
  if [ "$DRY_RUN" = 0 ] && command -v ss >/dev/null 2>&1 && ss -lnu | grep -q ':53 '; then
    echo "  Something else already answers DNS (port 53) on this Pi. Stop it first, then run the install again." >&2
    exit 1
  fi
  if [ "$DRY_RUN" = 1 ]; then
    echo "  [dry run] curl -fsSL $AGH_URL | tar -xz -C /opt"
  else
    curl -fsSL "$AGH_URL" | tar -xz -C /opt
  fi
  run "$AGH_DIR/AdGuardHome" -s install
  if [ "$DRY_RUN" = 1 ]; then
    echo "  [dry run] wait for the AdGuard Home first-run setup on 127.0.0.1:3000, then send it: admin page 127.0.0.1:3053, DNS 0.0.0.0:53, user popcorn, a random password"
    echo "  [dry run] write $DATA_DIR/adguard-credentials.json (mode 0600, owner $SVC_USER): that login, for the hub's secret store"
  else
    agh_pw="$(od -An -tx1 -N24 /dev/urandom | tr -d ' \n')"
    for _ in $(seq 1 30); do
      curl -fsS http://127.0.0.1:3000/control/install/get_addresses >/dev/null 2>&1 && break
      sleep 1
    done
    # The password goes on standard input, not the command line.
    printf '{"web":{"ip":"127.0.0.1","port":3053},"dns":{"ip":"0.0.0.0","port":53},"username":"popcorn","password":"%s"}' "$agh_pw" |
      curl -fsS -X POST http://127.0.0.1:3000/control/install/configure -H 'Content-Type: application/json' --data-binary @-
    printf '{"user":"popcorn","password":"%s"}\n' "$agh_pw" | write_file "$DATA_DIR/adguard-credentials.json" 0600 "$SVC_USER:$SVC_USER"
    unset agh_pw
  fi
fi

say "Installing the services"
for unit in popcorn-pilot.service popcorn-pilot-update.service popcorn-pilot-update.timer popcorn-pilot-update.path \
  popcorn-pilot-backup.service popcorn-pilot-backup.timer; do
  run install -m 0644 "$APP_DIR/deploy/systemd/$unit" "/etc/systemd/system/$unit"
done
run install -m 0440 "$APP_DIR/deploy/sudoers-popcorn-pilot" /etc/sudoers.d/popcorn-pilot
run visudo -cf /etc/sudoers.d/popcorn-pilot
run systemctl daemon-reload
run systemctl enable --now popcorn-pilot.service popcorn-pilot-update.timer popcorn-pilot-update.path popcorn-pilot-backup.timer

say "Checking the app answers"
as_svc env PORT="$PORT" node scripts/smoke.mjs

say "Done"
host="$(hostname)"
if [ "$PORT" = 80 ]; then url="http://$host.local"; else url="http://$host.local:$PORT"; fi
echo "Open $url on a phone or computer on the home Wi-Fi and set the Adult PIN and the Guest PIN."

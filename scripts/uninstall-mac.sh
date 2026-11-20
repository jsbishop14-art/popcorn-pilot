#!/bin/bash
# Removes the Popcorn Pilot hub from a Mac (PP7). Guide: docs/install-mac.md, "Removing the hub".
#   sudo bash /Library/PopcornPilot/app/scripts/uninstall-mac.sh                 keeps the data folder
#   sudo bash /Library/PopcornPilot/app/scripts/uninstall-mac.sh --remove-data   also deletes the database, its
#                                                                                backups and the key (cannot be undone)
# Removes everything scripts/install-mac.sh added: the launchd daemon, the firewall entry for the hub's Node copy,
# the hub's processes and the app folder (app, Node copy, logs, settings). Test mode (CI): --test --root DIR.
set -euo pipefail

ROOT="/Library/PopcornPilot"
LABEL="com.popcornpilot.hub"
REMOVE_DATA=0

while [ $# -gt 0 ]; do
  case "$1" in
    --root) ROOT="$2"; shift ;;
    --test) LABEL="com.popcornpilot.hub.test" ;;
    --remove-data) REMOVE_DATA=1 ;;
    -h|--help) echo "usage: uninstall-mac.sh [--remove-data] [--root DIR] [--test]"; exit 0 ;;
    *) echo "usage: uninstall-mac.sh [--remove-data] [--root DIR] [--test]"; exit 2 ;;
  esac
  shift
done

PLIST="/Library/LaunchDaemons/$LABEL.plist"
FW="/usr/libexec/ApplicationFirewall/socketfilterfw"
NODE="$ROOT/node/bin/node"

if [ "$(id -u)" != 0 ]; then
  echo "Run it with sudo: sudo bash $0" >&2
  exit 1
fi
# The uninstall may be run from the app folder it deletes: work from outside it.
cd /

if launchctl print "system/$LABEL" >/dev/null 2>&1; then
  launchctl bootout "system/$LABEL" || true
  echo "  stopped the daemon $LABEL"
fi
if [ -f "$PLIST" ]; then
  rm -f "$PLIST"
  echo "  removed $PLIST"
else
  echo "  no $PLIST"
fi

if [ -x "$FW" ] && "$FW" --listapps 2>/dev/null | grep -qF "$NODE"; then
  "$FW" --remove "$NODE" >/dev/null
  echo "  removed the firewall entry for $NODE"
fi

# The hub service and the app both run on the hub's own Node copy (the pattern's [e] keeps it from matching this
# script's own command line).
HUB_PROCS="${NODE%e}[e]"
if pgrep -f "$HUB_PROCS" >/dev/null 2>&1; then
  pkill -f "$HUB_PROCS" || true
  sleep 2
  pkill -9 -f "$HUB_PROCS" || true
fi
# The app renames its process "next-server"; one still running from the app folder is ended too.
for pid in $(pgrep -f 'next-server' || true); do
  if lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | grep -qxF "n$ROOT/app"; then
    kill -9 "$pid" 2>/dev/null || true
  fi
done
echo "  no hub process left"

if [ -d "$ROOT" ]; then
  if [ "$REMOVE_DATA" = 1 ]; then
    rm -rf "$ROOT"
    echo "  removed $ROOT, with the data"
  else
    find "$ROOT" -mindepth 1 -maxdepth 1 ! -name data -exec rm -rf {} +
    echo "  removed the app from $ROOT; kept the data in $ROOT/data (run again with --remove-data to delete it)"
  fi
else
  echo "  no folder $ROOT"
fi
echo "Done. Nothing else on this Mac was changed by the install."

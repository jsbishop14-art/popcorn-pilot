#!/bin/bash
# PP7 check 2 (CI macOS job): what the test-mode install left on the machine, and that the uninstall removes it.
#   mac-check.sh <root> <port> installed   the daemon com.popcornpilot.hub.test is loaded, runs at load and is kept
#                                          alive, runs as the installing user; the app listening on the port was
#                                          started by the hub service (scripts/hub-service.mjs)
#   mac-check.sh <root> <port> kept-data   after the uninstall without --remove-data: no daemon, no plist, nothing
#                                          listening, no hub process, only the data folder left
#   mac-check.sh <root> <port> removed     the same, and the folder is gone
# One line per item checked; exit 1 if any failed.
set -uo pipefail

ROOT="$1"
PORT="$2"
STAGE="$3"
LABEL="com.popcornpilot.hub.test"
PLIST="/Library/LaunchDaemons/$LABEL.plist"
failed=0

check() { # what, then a command that must succeed
  local what="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "ok   $what"
  else
    echo "FAIL $what"
    failed=$((failed + 1))
  fi
}

# The hub service and the app run on the hub's Node copy; [e] keeps the pattern from matching this script.
no_hub_process() { ! pgrep -f "$ROOT/node/bin/nod[e]"; }
listener_pid() { lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -n 1; }

if [ "$STAGE" = installed ]; then
  check "the daemon plist is in /Library/LaunchDaemons" test -f "$PLIST"
  check "the plist is valid" plutil -lint "$PLIST"
  check "the daemon starts at boot (RunAtLoad)" sh -c "plutil -extract RunAtLoad raw '$PLIST' | grep -qx true"
  check "the daemon is started again if it stops (KeepAlive)" sh -c "plutil -extract KeepAlive raw '$PLIST' | grep -qx true"
  check "the daemon runs as the installing user, not root" sh -c "test \"\$(plutil -extract UserName raw '$PLIST')\" = '${SUDO_USER:-$(id -un)}'"
  check "the daemon is loaded and running" sh -c "launchctl print system/$LABEL | grep -q 'state = running'"
  pid="$(listener_pid)"
  check "something listens on port $PORT" test -n "$pid"
  if [ -n "$pid" ]; then
    check "the app is next start from the app folder" sh -c "ps -o command= -p $pid | grep -F '$ROOT/' | grep -q next"
    ppid="$(ps -o ppid= -p "$pid" | tr -d ' ')"
    check "the app was started by the hub service" sh -c "ps -o command= -p $ppid | grep -q hub-service.mjs"
    check "the app runs as the installing user" sh -c "test \"\$(ps -o user= -p $pid | tr -d ' ')\" != root"
  fi
  for f in app/package.json node/bin/node data/popcorn.db data/master.key hub.json install.json; do
    check "installed: $f" test -e "$ROOT/$f"
  done
  check "the key is readable by its owner only (0600)" sh -c "test \"\$(stat -f %Lp '$ROOT/data/master.key')\" = 600"
  check "the folder is closed to other users (0700)" sh -c "test \"\$(stat -f %Lp '$ROOT')\" = 700"
else
  check "the daemon is gone" sh -c "! launchctl print system/$LABEL"
  check "the plist is gone" test ! -e "$PLIST"
  check "nothing listens on port $PORT" test -z "$(listener_pid)"
  check "no hub process" no_hub_process
  if [ "$STAGE" = kept-data ]; then
    check "only the data folder is left" sh -c "test \"\$(ls -A '$ROOT')\" = data"
    check "the data is kept (database and key)" sh -c "test -f '$ROOT/data/popcorn.db' && test -f '$ROOT/data/master.key'"
  else
    check "the folder is gone" test ! -e "$ROOT"
  fi
fi

if [ "$failed" -gt 0 ]; then
  echo "mac check ($STAGE): $failed failed"
  exit 1
fi
echo "mac check ($STAGE): all passed"

#!/usr/bin/env bash
# Install (sideload) the Popcorn Pilot channel on one Roku (PP6, handoff 9.6). Run later, with hardware, on the Pi:
#
#   cd /opt/popcorn-pilot && sudo -u popcorn env ROKU_DEV_PASSWORD='<the developer password>' bash scripts/roku-sideload.sh 192.168.1.40
#
# The Roku must have developer mode on (docs/install-pi.md step 11); the developer password is the one chosen when
# turning it on. It is read from ROKU_DEV_PASSWORD only for this run and never written anywhere.
# Builds the channel zip from the code here first (node scripts/roku-build.mjs), unless a zip is given after the
# address; the dry run builds only when there is no zip yet.
# Home network only: the address must be a home network address (10.x, 172.16-31.x, 192.168.x).
# --dry-run: check the address and the zip, and say what would be sent, without sending anything.
set -euo pipefail

DRY=0
ADDR=""
ZIP=""
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    -h|--help)
      sed -n '2,11p' "$0"
      exit 0
      ;;
    *)
      if [ -z "$ADDR" ]; then ADDR="$a"; else ZIP="$a"; fi
      ;;
  esac
done

cd "$(dirname "$0")/.."
ZIP="${ZIP:-build/popcorn-pilot-channel.zip}"

if [ -z "$ADDR" ]; then
  echo "Give the Roku's address, for example: bash scripts/roku-sideload.sh 192.168.1.40" >&2
  exit 2
fi

# A home network IPv4 address only.
home_address() {
  local ip="$1" a b c d
  [[ "$ip" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || return 1
  a="${BASH_REMATCH[1]}"; b="${BASH_REMATCH[2]}"; c="${BASH_REMATCH[3]}"; d="${BASH_REMATCH[4]}"
  for n in "$a" "$b" "$c" "$d"; do [ "$n" -le 255 ] || return 1; done
  [ "$a" -eq 10 ] && return 0
  [ "$a" -eq 192 ] && [ "$b" -eq 168 ] && return 0
  [ "$a" -eq 172 ] && [ "$b" -ge 16 ] && [ "$b" -le 31 ] && return 0
  return 1
}

if ! home_address "$ADDR"; then
  echo "$ADDR is not a home network address (10.x, 172.16-31.x or 192.168.x). Use the address from the Roku's Settings > Network > About." >&2
  exit 2
fi

if [ "$ZIP" = "build/popcorn-pilot-channel.zip" ] && { [ "$DRY" = 0 ] || [ ! -f "$ZIP" ]; }; then
  # Build from the code on this machine, so running this again after an update installs the new channel.
  echo "Building the channel..."
  node scripts/roku-build.mjs
fi
if [ ! -f "$ZIP" ]; then
  echo "No channel zip at $ZIP." >&2
  exit 1
fi

if [ "$DRY" = 1 ]; then
  echo "[dry run] would send $ZIP ($(wc -c < "$ZIP") bytes) to http://$ADDR/plugin_install as rokudev (password from ROKU_DEV_PASSWORD)"
  exit 0
fi

if [ -z "${ROKU_DEV_PASSWORD:-}" ]; then
  echo "Set ROKU_DEV_PASSWORD to the developer password chosen when developer mode was turned on." >&2
  exit 2
fi

# The Roku's developer installer: digest login as rokudev, the zip as "archive". The password goes to curl on its
# standard input (a config line), so it is not in the process list.
out="$(mktemp)"
trap 'rm -f "$out"' EXIT
code="$(printf 'user = "rokudev:%s"\n' "$ROKU_DEV_PASSWORD" | curl --config - --digest --silent --show-error \
  --max-time 120 --output "$out" --write-out '%{http_code}' \
  --form-string 'mysubmit=Install' --form "archive=@$ZIP;type=application/zip" \
  "http://$ADDR/plugin_install")" || {
  echo "The Roku at $ADDR did not answer. Check it is on, developer mode is on, and the address is right." >&2
  exit 1
}
if [ "$code" = "401" ]; then
  echo "The Roku refused the developer password." >&2
  exit 1
fi
if [ "$code" != "200" ] || ! grep -qiE 'Install Success|Identical to previous version' "$out"; then
  echo "The Roku answered $code but did not say the install worked:" >&2
  grep -oiE '<font color="red">[^<]*|Install Failure[^<]*' "$out" >&2 || true
  exit 1
fi
echo "Installed the Popcorn Pilot channel on the Roku at $ADDR."
echo "Next: in Popcorn Pilot on your phone, Settings, pick this TV, then Pair the channel."

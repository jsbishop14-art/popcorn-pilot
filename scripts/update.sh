#!/usr/bin/env bash
# Pi updater (handoff 11.2): pull main, install, build, migrate, restart, smoke check; on any failure roll back to the
# previous version and restore the database copied just before. Runs daily (timer) and when Settings asks
# (Check for updates now leaves $PP_DATA_DIR/update-requested, which a path unit watches).
#
# Every command can be replaced through an environment variable, so the rollback is tested without a Pi
# (test/unit/updater.test.ts).
set -euo pipefail

# The whole script is one function, read completely before it runs, because "git reset" below replaces this file.
main() {
  local app_dir="${PP_APP_DIR:-/opt/popcorn-pilot}"
  local data_dir="${PP_DATA_DIR:-/var/lib/popcorn-pilot}"
  local branch="${PP_BRANCH:-main}"
  local install_cmd="${PP_INSTALL_CMD:-npm ci --no-audit --no-fund}"
  local build_cmd="${PP_BUILD_CMD:-npm run build}"
  local migrate_cmd="${PP_MIGRATE_CMD:-node scripts/migrate.mjs}"
  local backup_cmd="${PP_BACKUP_CMD:-node scripts/backup.mjs}"
  local smoke_cmd="${PP_SMOKE_CMD:-node scripts/smoke.mjs}"
  local stop_cmd="${PP_STOP_CMD:-sudo /usr/bin/systemctl stop popcorn-pilot}"
  local start_cmd="${PP_START_CMD:-sudo /usr/bin/systemctl start popcorn-pilot}"
  local status_file="$data_dir/update-status.json"
  local log_file="$data_dir/update.log"
  local db="$data_dir/popcorn.db"

  mkdir -p "$data_dir/backups"
  exec 9>"$data_dir/update.lock"
  if ! flock -n 9; then
    echo "another update is running"
    return 0
  fi
  rm -f "$data_dir/update-requested"
  cd "$app_dir"

  log() { printf '%s %s\n' "$(date -Is)" "$*" | tee -a "$log_file"; }
  status() { # result from to message
    printf '{"at":"%s","result":"%s","from":"%s","to":"%s","message":"%s"}\n' \
      "$(date -Is)" "$1" "$2" "$3" "${4//\"/\'}" > "$status_file"
  }
  step() { # name command...
    log "step: $1"
    shift
    if ! bash -c "$*" >> "$log_file" 2>&1; then
      log "failed: $*"
      return 1
    fi
  }

  local old new
  old="$(git rev-parse HEAD)"
  git fetch --quiet origin "$branch"
  new="$(git rev-parse "origin/$branch")"
  if [ "$old" = "$new" ]; then
    log "up to date at ${old:0:7}"
    status up_to_date "$old" "$new" ""
    return 0
  fi
  log "updating ${old:0:7} -> ${new:0:7}"

  local pre
  pre="$data_dir/backups/pre-update-$(date +%Y%m%d-%H%M%S)-${old:0:7}.db"
  step "stop the app" "$stop_cmd" || true
  if [ -f "$db" ]; then
    step "back up the database" "$backup_cmd --out '$pre'" || { status failed "$old" "$new" "backup failed; nothing changed"; step "start the app" "$start_cmd" || true; return 1; }
  fi

  local failed=""
  git reset --quiet --hard "$new"
  step "install" "$install_cmd" || failed="install"
  [ -z "$failed" ] && { step "build" "$build_cmd" || failed="build"; }
  [ -z "$failed" ] && { step "migrate" "$migrate_cmd" || failed="migrate"; }
  [ -z "$failed" ] && { step "start the app" "$start_cmd" || failed="start"; }
  [ -z "$failed" ] && { step "smoke check" "$smoke_cmd" || failed="smoke check"; }

  if [ -z "$failed" ]; then
    log "updated to ${new:0:7}"
    status updated "$old" "$new" ""
    return 0
  fi

  log "rolling back to ${old:0:7} after: $failed"
  step "stop the app" "$stop_cmd" || true
  git reset --quiet --hard "$old"
  if [ -f "$pre" ]; then
    cp "$pre" "$db"
    rm -f "$db-wal" "$db-shm"
    log "database restored from $pre"
  fi
  local rb_ok=1
  step "install (rollback)" "$install_cmd" || rb_ok=0
  [ "$rb_ok" = 1 ] && { step "build (rollback)" "$build_cmd" || rb_ok=0; }
  [ "$rb_ok" = 1 ] && { step "start the app (rollback)" "$start_cmd" || rb_ok=0; }
  [ "$rb_ok" = 1 ] && { step "smoke check (rollback)" "$smoke_cmd" || rb_ok=0; }
  if [ "$rb_ok" = 1 ]; then
    status rolled_back "$old" "$new" "update to ${new:0:7} failed at: $failed; back on ${old:0:7}"
  else
    status failed "$old" "$new" "update failed at: $failed, and the rollback did not pass its smoke check"
  fi
  return 1
}

main "$@"
exit $?

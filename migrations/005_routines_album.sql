-- 005_routines_album: PP5 routines (one button sets a TV up), their runs and sleep timers, and the Family Album cache
-- (photos and short clips synced from an iCloud shared album) with its sync history.
-- The Pi updater (scripts/migrate.mjs --verify) reads these objects back after applying this file.
-- expect: table routines
-- expect: table routine_steps
-- expect: table routine_runs
-- expect: table album_items
-- expect: table album_syncs
-- expect: index idx_routines_live
-- expect: index idx_routine_steps_order
-- expect: index idx_routine_runs_routine
-- expect: index idx_routine_runs_timer
-- expect: index idx_album_items_kind
-- expect: index idx_album_syncs_at
-- expect: trigger trg_routines_updated

-- A routine (handoff 7): a name, a picture (one of a bundled set, by key), the TV it sets up, and an optional
-- schedule: days (JSON list of mon..sun) and a local time HH:MM. schedule_last_run is the local date it last started
-- on schedule (YYYY-MM-DD). Soft delete.
CREATE TABLE routines (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  icon               TEXT    NOT NULL DEFAULT 'tv' CHECK (icon IN ('sun', 'tv', 'moon', 'star')),
  tv_id              INTEGER REFERENCES tvs (id),
  schedule_on        INTEGER NOT NULL DEFAULT 0 CHECK (schedule_on IN (0, 1)),
  schedule_days      TEXT    NOT NULL DEFAULT '[]',
  schedule_time      TEXT    CHECK (schedule_time IS NULL OR schedule_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  schedule_last_run  TEXT,
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at         TEXT
);
CREATE INDEX idx_routines_live ON routines (deleted_at, name);

-- The steps of a routine, run in order. Each kind at most once per routine:
-- power_on (turn the TV on), profile (switch the TV to a profile), volume (set the volume, 0 to 100),
-- playlist (start a playlist), timer (turn the TV off after a number of minutes).
CREATE TABLE routine_steps (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  routine_id   INTEGER NOT NULL REFERENCES routines (id),
  position     INTEGER NOT NULL,
  kind         TEXT    NOT NULL CHECK (kind IN ('power_on', 'profile', 'volume', 'playlist', 'timer')),
  profile_id   INTEGER REFERENCES profiles (id),
  volume       INTEGER CHECK (volume IS NULL OR volume BETWEEN 0 AND 100),
  playlist_id  INTEGER REFERENCES playlists (id),
  minutes      INTEGER CHECK (minutes IS NULL OR minutes BETWEEN 1 AND 600),
  CHECK ((kind = 'profile') = (profile_id IS NOT NULL)),
  CHECK ((kind = 'volume') = (volume IS NOT NULL)),
  CHECK ((kind = 'playlist') = (playlist_id IS NOT NULL)),
  CHECK ((kind = 'timer') = (minutes IS NOT NULL))
);
CREATE INDEX idx_routine_steps_order ON routine_steps (routine_id, position);

-- Each time a routine ran (Run, Test now, its schedule, or the TV home screen). routine_id is NULL for a Test now
-- of a routine not saved yet. steps is a JSON list of what each step did. A timer step sets timer_off_at (epoch ms);
-- timer_done_at is when the hub turned the TV off, or when the timer was cancelled (timer_note says which).
CREATE TABLE routine_runs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  routine_id     INTEGER REFERENCES routines (id),
  name           TEXT    NOT NULL,
  tv_id          INTEGER NOT NULL REFERENCES tvs (id),
  started_at     INTEGER NOT NULL,
  ended_at       INTEGER,
  status         TEXT    NOT NULL CHECK (status IN ('running', 'done', 'failed')),
  started_by     TEXT    NOT NULL CHECK (started_by IN ('adult', 'hub', 'channel')),
  test           INTEGER NOT NULL DEFAULT 0 CHECK (test IN (0, 1)),
  steps          TEXT    NOT NULL DEFAULT '[]',
  message        TEXT,
  timer_off_at   INTEGER,
  timer_done_at  INTEGER,
  timer_note     TEXT
);
CREATE INDEX idx_routine_runs_routine ON routine_runs (routine_id, started_at);
CREATE INDEX idx_routine_runs_timer ON routine_runs (timer_done_at, timer_off_at);

-- The Family Album cache (handoff 8): one row per photo or clip of the iCloud shared album, by its iCloud id (guid).
-- checksum is the iCloud checksum of the copy kept on the hub; a new checksum means the item changed. file is the
-- file name under <data>/album/. Rows are removed when the item leaves the album (it is a copy of iCloud).
CREATE TABLE album_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guid        TEXT    NOT NULL UNIQUE,
  kind        TEXT    NOT NULL CHECK (kind IN ('photo', 'clip')),
  checksum    TEXT    NOT NULL,
  file        TEXT    NOT NULL,
  mime        TEXT    NOT NULL,
  width       INTEGER,
  height      INTEGER,
  bytes       INTEGER NOT NULL,
  caption     TEXT,
  taken_at    TEXT,
  added_at    INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_album_items_kind ON album_items (kind, taken_at);

-- Each album sync: when, the result, what changed, the counts after it, and the error in plain words when it failed.
CREATE TABLE album_syncs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER,
  result      TEXT    NOT NULL CHECK (result IN ('running', 'ok', 'error')),
  added       INTEGER NOT NULL DEFAULT 0,
  updated     INTEGER NOT NULL DEFAULT 0,
  removed     INTEGER NOT NULL DEFAULT 0,
  skipped     INTEGER NOT NULL DEFAULT 0,
  photos      INTEGER NOT NULL DEFAULT 0,
  clips       INTEGER NOT NULL DEFAULT 0,
  message     TEXT
);
CREATE INDEX idx_album_syncs_at ON album_syncs (started_at);

-- How often the hub syncs the Family Album, in hours.
INSERT INTO settings (key, value) VALUES ('album_sync_hours', '6');

CREATE TRIGGER trg_routines_updated AFTER UPDATE ON routines
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN UPDATE routines SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;

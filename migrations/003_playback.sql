-- 003_playback: PP3 playlists, the quick playlist, schedules, and the playback engine's state per TV (live queue).
-- The Pi updater (scripts/migrate.mjs --verify) reads these objects back after applying this file.
-- expect: table playlists
-- expect: table playlist_items
-- expect: table playback
-- expect: table queue_items
-- expect: index idx_playlists_live
-- expect: index idx_playlist_items_order
-- expect: index idx_playback_tv_live
-- expect: index idx_queue_items_order
-- expect: trigger trg_playlists_updated

-- A playlist. quick = 1 is the one unsaved, unnamed quick playlist (handoff 6.2); "Save as playlist" turns it into a
-- saved one. Soft delete. The schedule (handoff 6.4) is one entry per playlist: days (JSON list of mon..sun), a
-- local time HH:MM, a TV and an optional profile. schedule_last_run is the local date it last started (YYYY-MM-DD).
CREATE TABLE playlists (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  name                  TEXT    NOT NULL CHECK (length(name) <= 60),
  quick                 INTEGER NOT NULL DEFAULT 0 CHECK (quick IN (0, 1)),
  loop                  INTEGER NOT NULL DEFAULT 0 CHECK (loop IN (0, 1)),
  shuffle               INTEGER NOT NULL DEFAULT 0 CHECK (shuffle IN (0, 1)),
  schedule_on           INTEGER NOT NULL DEFAULT 0 CHECK (schedule_on IN (0, 1)),
  schedule_days         TEXT    NOT NULL DEFAULT '[]',
  schedule_time         TEXT    CHECK (schedule_time IS NULL OR schedule_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  schedule_tv_id        INTEGER REFERENCES tvs (id),
  schedule_profile_id   INTEGER REFERENCES profiles (id),
  schedule_last_run     TEXT,
  created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at            TEXT
);
CREATE INDEX idx_playlists_live ON playlists (deleted_at, quick, name);

-- The titles of a playlist, in order. kind 'title' is a Netflix, Prime Video or Hulu title (title_key '<tv|movie>-<id>',
-- with its name, rating, cover art and lengths kept so lists show without asking TMDB); kind 'album' is the Family
-- Album (PP5). mode (handoff 6.3): 'episodes' (a number of episodes; a movie is 1), 'stay' (stay on show), 'time'
-- (minutes on show, stopping at the end of an episode), 'indefinite' (run indefinitely).
CREATE TABLE playlist_items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id       INTEGER NOT NULL REFERENCES playlists (id),
  position          INTEGER NOT NULL,
  kind              TEXT    NOT NULL CHECK (kind IN ('title', 'album')),
  title_key         TEXT    CHECK (title_key IS NULL OR title_key GLOB '[tm][vo]*-[0-9]*'),
  title_kind        TEXT    CHECK (title_kind IS NULL OR title_kind IN ('show', 'movie')),
  service           TEXT    CHECK (service IS NULL OR service IN ('netflix', 'prime', 'hulu')),
  name              TEXT    NOT NULL,
  rating            TEXT,
  poster            TEXT,
  episode_minutes   INTEGER,
  runtime_minutes   INTEGER,
  mode              TEXT    NOT NULL CHECK (mode IN ('episodes', 'stay', 'time', 'indefinite')),
  episodes          INTEGER NOT NULL DEFAULT 1 CHECK (episodes BETWEEN 1 AND 99),
  minutes           INTEGER NOT NULL DEFAULT 30 CHECK (minutes BETWEEN 5 AND 600),
  start_from        TEXT,
  CHECK ((kind = 'title') = (title_key IS NOT NULL AND service IS NOT NULL))
);
CREATE INDEX idx_playlist_items_order ON playlist_items (playlist_id, position);

-- What a TV is playing: one live row per TV (state playing or paused). A playlist started on both TVs is two rows.
-- Timing is approximate (streaming apps do not reliably report position): item_played_ms is the playing time of the
-- current title so far, item_resumed_at the hub clock (epoch ms) when it last started or resumed, null while paused.
-- message is the last thing worth telling the household (a failed launch, a skipped Family Album item).
CREATE TABLE playback (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tv_id            INTEGER NOT NULL REFERENCES tvs (id),
  playlist_id      INTEGER REFERENCES playlists (id),
  name             TEXT    NOT NULL,
  profile_id       INTEGER REFERENCES profiles (id),
  state            TEXT    NOT NULL CHECK (state IN ('playing', 'paused', 'ended', 'stopped')),
  loop             INTEGER NOT NULL DEFAULT 0 CHECK (loop IN (0, 1)),
  shuffle          INTEGER NOT NULL DEFAULT 0 CHECK (shuffle IN (0, 1)),
  current_item_id  INTEGER,
  item_played_ms   INTEGER NOT NULL DEFAULT 0,
  item_resumed_at  INTEGER,
  started_by       TEXT    NOT NULL CHECK (started_by IN ('adult', 'guest', 'hub')),
  started_at       INTEGER NOT NULL,
  ended_at         INTEGER,
  message          TEXT
);
CREATE UNIQUE INDEX idx_playback_tv_live ON playback (tv_id) WHERE state IN ('playing', 'paused');

-- The live queue of a playback (handoff 6.4): a copy of the playlist's titles when it started (shuffled when shuffle
-- is on), then reordered, removed, skipped or added to. status: pending, playing, done, skipped, failed, removed.
CREATE TABLE queue_items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  playback_id       INTEGER NOT NULL REFERENCES playback (id),
  position          INTEGER NOT NULL,
  kind              TEXT    NOT NULL CHECK (kind IN ('title', 'album')),
  title_key         TEXT,
  title_kind        TEXT,
  service           TEXT,
  name              TEXT    NOT NULL,
  rating            TEXT,
  poster            TEXT,
  episode_minutes   INTEGER,
  runtime_minutes   INTEGER,
  mode              TEXT    NOT NULL CHECK (mode IN ('episodes', 'stay', 'time', 'indefinite')),
  episodes          INTEGER NOT NULL DEFAULT 1,
  minutes           INTEGER NOT NULL DEFAULT 30,
  start_from        TEXT,
  status            TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'playing', 'done', 'skipped', 'failed', 'removed')),
  launch_route      TEXT    CHECK (launch_route IS NULL OR launch_route IN ('deep_link', 'search')),
  note              TEXT
);
CREATE INDEX idx_queue_items_order ON queue_items (playback_id, status, position);

CREATE TRIGGER trg_playlists_updated AFTER UPDATE ON playlists
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN UPDATE playlists SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;

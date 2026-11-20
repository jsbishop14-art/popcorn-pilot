-- 002_catalog: PP2 catalog. TMDB answers cached on the hub, household title tags (calm, blocked for kids), and the
-- launch log (which launch route each title used, handoff 2.4).
-- The Pi updater (scripts/migrate.mjs --verify) reads these objects back after applying this file.
-- expect: table catalog_cache
-- expect: table title_tags
-- expect: table launch_log
-- expect: index idx_catalog_cache_fetched
-- expect: index idx_title_tags_calm
-- expect: index idx_title_tags_blocked
-- expect: index idx_launch_log_title
-- expect: trigger trg_title_tags_updated

-- One row per TMDB answer (a list page, a title's details). fetched_at is epoch milliseconds. A stale row is still
-- served when TMDB cannot be reached (the hub may have no internet at times).
CREATE TABLE catalog_cache (
  key         TEXT    PRIMARY KEY,
  body        TEXT    NOT NULL,
  fetched_at  INTEGER NOT NULL
);
CREATE INDEX idx_catalog_cache_fetched ON catalog_cache (fetched_at);

-- Household tags on a title. title_key is '<tv|movie>-<TMDB id>'. Name, service and rating are kept so Settings can
-- list tagged titles without asking TMDB. A tag is removed by setting its flag to 0 (the row stays, as history).
CREATE TABLE title_tags (
  title_key   TEXT    PRIMARY KEY CHECK (title_key GLOB '[tm][vo]*-[0-9]*'),
  name        TEXT    NOT NULL,
  services    TEXT    NOT NULL DEFAULT '[]',
  rating      TEXT,
  calm        INTEGER NOT NULL DEFAULT 0 CHECK (calm IN (0, 1)),
  blocked     INTEGER NOT NULL DEFAULT 0 CHECK (blocked IN (0, 1)),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_title_tags_calm ON title_tags (calm);
CREATE INDEX idx_title_tags_blocked ON title_tags (blocked);

CREATE TRIGGER trg_title_tags_updated AFTER UPDATE ON title_tags
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN UPDATE title_tags SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE title_key = NEW.title_key; END;

-- Every launch the hub sent to a TV: a title on a service, or a trailer on YouTube. route is 'deep_link' or 'search'.
CREATE TABLE launch_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  title_key   TEXT    NOT NULL,
  kind        TEXT    NOT NULL CHECK (kind IN ('title', 'trailer')),
  service     TEXT    NOT NULL CHECK (service IN ('netflix', 'prime', 'hulu', 'youtube')),
  tv_id       INTEGER NOT NULL REFERENCES tvs (id),
  profile_id  INTEGER REFERENCES profiles (id),
  route       TEXT    NOT NULL CHECK (route IN ('deep_link', 'search')),
  ok          INTEGER NOT NULL CHECK (ok IN (0, 1)),
  error       TEXT
);
CREATE INDEX idx_launch_log_title ON launch_log (title_key, at);

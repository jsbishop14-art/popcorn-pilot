-- 001_init: PP1 foundation. Profiles, kid safeguard defaults, TVs, settings, sessions, lockout, activity history.
-- The Pi updater (scripts/migrate.mjs --verify) reads these objects back after applying this file.
-- expect: table profiles
-- expect: table kid_safeguards
-- expect: table tvs
-- expect: table settings
-- expect: table sessions
-- expect: table pin_lockout
-- expect: table activity
-- expect: index idx_profiles_live
-- expect: index idx_tvs_address_live
-- expect: index idx_sessions_token
-- expect: index idx_activity_at
-- expect: trigger trg_profiles_updated
-- expect: trigger trg_tvs_updated

CREATE TABLE profiles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  color       TEXT    NOT NULL CHECK (color GLOB '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]'),
  initial     TEXT    NOT NULL CHECK (length(initial) BETWEEN 1 AND 2),
  type        TEXT    NOT NULL CHECK (type IN ('adult', 'kid')),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at  TEXT
);
CREATE INDEX idx_profiles_live ON profiles (deleted_at, name);

-- Stored with defaults in PP1; the editor and enforcement arrive in PP4.
-- daily_limits: JSON object of minutes by day, keys mon..sun.
CREATE TABLE kid_safeguards (
  profile_id          INTEGER PRIMARY KEY REFERENCES profiles (id),
  allowed_ratings     TEXT    NOT NULL DEFAULT '["TV-Y","TV-Y7","TV-G","G"]',
  blocked_titles      TEXT    NOT NULL DEFAULT '[]',
  daily_limits        TEXT    NOT NULL DEFAULT '{"mon":60,"tue":60,"wed":60,"thu":60,"fri":90,"sat":120,"sun":120}',
  hours_start         TEXT    NOT NULL DEFAULT '07:00',
  hours_end           TEXT    NOT NULL DEFAULT '19:30',
  warning_minutes     INTEGER NOT NULL DEFAULT 5,
  finish_episode      INTEGER NOT NULL DEFAULT 1 CHECK (finish_episode IN (0, 1)),
  wind_down           INTEGER NOT NULL DEFAULT 1 CHECK (wind_down IN (0, 1)),
  wind_down_minutes   INTEGER NOT NULL DEFAULT 15,
  snap_back           INTEGER NOT NULL DEFAULT 1 CHECK (snap_back IN (0, 1)),
  alert_on_snap_back  INTEGER NOT NULL DEFAULT 1 CHECK (alert_on_snap_back IN (0, 1)),
  can_ask_for_time    INTEGER NOT NULL DEFAULT 1 CHECK (can_ask_for_time IN (0, 1)),
  weekly_bonus_cap    INTEGER NOT NULL DEFAULT 60
);

CREATE TABLE tvs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  room                TEXT    NOT NULL DEFAULT '' CHECK (length(room) <= 40),
  address             TEXT    NOT NULL,
  port                INTEGER NOT NULL DEFAULT 8060,
  type                TEXT    NOT NULL DEFAULT 'roku' CHECK (type IN ('roku')),
  serial              TEXT,
  model               TEXT,
  default_profile_id  INTEGER REFERENCES profiles (id),
  online              INTEGER NOT NULL DEFAULT 0 CHECK (online IN (0, 1)),
  last_seen_at        TEXT,
  checked_at          TEXT,
  channel_token_hash  TEXT,
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at          TEXT
);
CREATE UNIQUE INDEX idx_tvs_address_live ON tvs (address, port) WHERE deleted_at IS NULL;

CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES ('lock_minutes', '5');

-- Signed-in app sessions. token_hash is an HMAC of the cookie value; the cookie itself is never stored.
CREATE TABLE sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash    TEXT    NOT NULL,
  pin_type      TEXT    NOT NULL CHECK (pin_type IN ('adult', 'guest')),
  device        TEXT    NOT NULL,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  ended_at      INTEGER
);
CREATE UNIQUE INDEX idx_sessions_token ON sessions (token_hash);

-- One row: the hub-wide wrong PIN counter.
CREATE TABLE pin_lockout (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  failures      INTEGER NOT NULL DEFAULT 0,
  locked_until  INTEGER NOT NULL DEFAULT 0
);
INSERT INTO pin_lockout (id, failures, locked_until) VALUES (1, 0, 0);

CREATE TABLE activity (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  pin_type  TEXT    NOT NULL CHECK (pin_type IN ('adult', 'guest', 'kid', 'hub')),
  device    TEXT    NOT NULL,
  action    TEXT    NOT NULL,
  summary   TEXT    NOT NULL
);
CREATE INDEX idx_activity_at ON activity (at);

CREATE TRIGGER trg_profiles_updated AFTER UPDATE ON profiles
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN UPDATE profiles SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;

CREATE TRIGGER trg_tvs_updated AFTER UPDATE ON tvs
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN UPDATE tvs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;

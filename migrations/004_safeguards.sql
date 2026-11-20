-- 004_safeguards: PP4 kid safeguards on the hub. Which profile each TV is on (kid mode) and what the hub last launched
-- there (snap back), requests from the kid screens, earn time tasks, extra minutes granted, the watch log, and alerts.
-- The Pi updater (scripts/migrate.mjs --verify) reads these objects back after applying this file.
-- expect: table tv_state
-- expect: table kid_requests
-- expect: table tasks
-- expect: table time_grants
-- expect: table watch_log
-- expect: table alerts
-- expect: index idx_kid_requests_status
-- expect: index idx_tasks_live
-- expect: index idx_time_grants_profile_day
-- expect: index idx_time_grants_profile_week
-- expect: index idx_watch_log_profile_day
-- expect: index idx_watch_log_item
-- expect: index idx_alerts_at
-- expect: trigger trg_tasks_updated

-- One row per TV once the hub has set its profile (a playlist started for a profile, or the profile switched in the
-- app). profile_id NULL means no profile (adult use). A TV whose profile is a kid profile is in kid mode: snap back
-- watches it and the kid rules apply. expected_app is the Roku channel id the hub last launched there (or the Popcorn
-- Pilot channel when nothing is playing); expected_at is when (epoch ms), so the watcher gives a launch time to land.
CREATE TABLE tv_state (
  tv_id         INTEGER PRIMARY KEY REFERENCES tvs (id),
  profile_id    INTEGER REFERENCES profiles (id),
  set_at        INTEGER NOT NULL,
  set_by        TEXT    NOT NULL CHECK (set_by IN ('adult', 'guest', 'hub', 'kid')),
  expected_app  TEXT,
  expected_at   INTEGER,
  volume_steps  INTEGER NOT NULL DEFAULT 0
);

-- Requests from the kid screens on the TV (handoff 5.6, 5.12): more time (minutes), a new title, or a task marked
-- done. An adult approves or denies in the app, or with the Adult PIN on the TV. Kept as history.
CREATE TABLE kid_requests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id      INTEGER NOT NULL REFERENCES profiles (id),
  tv_id           INTEGER REFERENCES tvs (id),
  kind            TEXT    NOT NULL CHECK (kind IN ('time', 'title', 'task')),
  minutes         INTEGER CHECK (minutes IS NULL OR minutes BETWEEN 1 AND 240),
  title_key       TEXT    CHECK (title_key IS NULL OR title_key GLOB '[tm][vo]*-[0-9]*'),
  title_name      TEXT,
  service         TEXT    CHECK (service IS NULL OR service IN ('netflix', 'prime', 'hulu')),
  rating          TEXT,
  task_id         INTEGER REFERENCES tasks (id),
  status          TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  created_at      INTEGER NOT NULL,
  decided_at      INTEGER,
  decided_by      TEXT    CHECK (decided_by IS NULL OR decided_by IN ('adult')),
  decided_device  TEXT,
  outcome         TEXT,
  CHECK ((kind = 'time') = (minutes IS NOT NULL)),
  CHECK ((kind = 'title') = (title_key IS NOT NULL)),
  CHECK ((kind = 'task') = (task_id IS NOT NULL))
);
CREATE INDEX idx_kid_requests_status ON kid_requests (status, created_at);

-- Earn time tasks (handoff 5.12), shared by every kid profile: a name, the minutes it earns and a picture (one of
-- the bundled pictures, by key). Soft delete.
CREATE TABLE tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  minutes     INTEGER NOT NULL CHECK (minutes BETWEEN 1 AND 120),
  picture     TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at  TEXT
);
CREATE INDEX idx_tasks_live ON tasks (deleted_at, name);

-- Extra minutes for a kid on a day: an approved request for more time, or a task done (capped by the weekly bonus
-- cap; minutes is what was actually added, 0 once the cap is reached). day is the hub's local date (YYYY-MM-DD) and
-- week the local date of that week's Monday.
CREATE TABLE time_grants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id  INTEGER NOT NULL REFERENCES profiles (id),
  day         TEXT    NOT NULL,
  week        TEXT    NOT NULL,
  source      TEXT    NOT NULL CHECK (source IN ('request', 'task')),
  minutes     INTEGER NOT NULL CHECK (minutes >= 0),
  asked       INTEGER NOT NULL CHECK (asked >= 0),
  task_id     INTEGER REFERENCES tasks (id),
  request_id  INTEGER REFERENCES kid_requests (id),
  at          INTEGER NOT NULL,
  by_pin      TEXT    NOT NULL CHECK (by_pin IN ('adult')),
  device      TEXT    NOT NULL
);
CREATE INDEX idx_time_grants_profile_day ON time_grants (profile_id, day);
CREATE INDEX idx_time_grants_profile_week ON time_grants (profile_id, week);

-- The watch log (handoff 5.13): one row per title a kid profile played on a TV. Times are approximate (the hub's own
-- count of playing time). base_ms is the title's playing time already counted elsewhere when this row began (a
-- title sent from the other TV), so it is not counted twice. day is the local date the title started.
CREATE TABLE watch_log (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id       INTEGER NOT NULL REFERENCES profiles (id),
  tv_id            INTEGER NOT NULL REFERENCES tvs (id),
  playback_id      INTEGER NOT NULL REFERENCES playback (id),
  queue_item_id    INTEGER NOT NULL REFERENCES queue_items (id),
  title_key        TEXT,
  name             TEXT    NOT NULL,
  service          TEXT,
  title_kind       TEXT,
  episode_minutes  INTEGER,
  day              TEXT    NOT NULL,
  started_at       INTEGER NOT NULL,
  ended_at         INTEGER,
  base_ms          INTEGER NOT NULL DEFAULT 0,
  played_ms        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_watch_log_profile_day ON watch_log (profile_id, day);
CREATE INDEX idx_watch_log_item ON watch_log (queue_item_id, ended_at);

-- Alerts for adults, in the app only (handoff 5.10): snap back (left the playlist, pressed Home, opened another
-- app), a start outside viewing hours, the time warning, time is up.
CREATE TABLE alerts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          INTEGER NOT NULL,
  kind        TEXT    NOT NULL CHECK (kind IN ('left_playlist', 'home', 'other_app', 'outside_hours', 'time_warning', 'time_up')),
  profile_id  INTEGER REFERENCES profiles (id),
  tv_id       INTEGER REFERENCES tvs (id),
  title       TEXT    NOT NULL,
  detail      TEXT    NOT NULL
);
CREATE INDEX idx_alerts_at ON alerts (at);

-- Per playback, what the kid rules have done so far: the last episode boundary seen in the current title (-1 before
-- the first), when the time warning was given, when wind-down began, and when the volume last stepped down.
ALTER TABLE playback ADD COLUMN kid_ep_seen INTEGER NOT NULL DEFAULT -1;
ALTER TABLE playback ADD COLUMN kid_warned_at INTEGER;
ALTER TABLE playback ADD COLUMN kid_wind_down_at INTEGER;
ALTER TABLE playback ADD COLUMN kid_volume_at INTEGER;

-- The Roku channel id of the Popcorn Pilot channel (a sideloaded channel is "dev"), launched by snap back when
-- nothing is playing.
INSERT INTO settings (key, value) VALUES ('channel_app_id', 'dev');

CREATE TRIGGER trg_tasks_updated AFTER UPDATE ON tasks
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN UPDATE tasks SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id; END;

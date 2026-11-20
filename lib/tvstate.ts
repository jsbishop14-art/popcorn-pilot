// Which profile each TV is on (kid mode) and what the hub last launched there, for snap back (handoff 5.7).
// A TV is in kid mode when the hub has set it to a kid profile: a playlist or title started for a kid, or the
// profile switched in the app. Only the hub's own launches are recorded here, so anything else on the screen is
// a change Popcorn Pilot did not start.
import { getDb, getSetting } from './db';
import type { TvStateRow } from './db/types.gen';

export type SetBy = 'adult' | 'guest' | 'hub' | 'kid';

export function tvState(tvId: number): TvStateRow | undefined {
  return getDb().prepare('SELECT * FROM tv_state WHERE tv_id = ?').get(tvId) as TvStateRow | undefined;
}

/** The profile the hub has set on a TV (null: none set, or set to no profile). */
export function tvProfileId(tvId: number): number | null {
  return tvState(tvId)?.profile_id ?? null;
}

/** The kid profile a TV is in kid mode for, or null when it is not in kid mode. */
export function kidModeProfile(tvId: number): number | null {
  const r = getDb()
    .prepare("SELECT s.profile_id AS id FROM tv_state s JOIN profiles p ON p.id = s.profile_id WHERE s.tv_id = ? AND p.type = 'kid'")
    .get(tvId) as { id: number } | undefined;
  return r?.id ?? null;
}

export function setTvProfile(tvId: number, profileId: number | null, by: SetBy, at: number): void {
  getDb()
    .prepare(
      `INSERT INTO tv_state (tv_id, profile_id, set_at, set_by) VALUES (?, ?, ?, ?)
       ON CONFLICT (tv_id) DO UPDATE SET profile_id = excluded.profile_id, set_at = excluded.set_at, set_by = excluded.set_by`,
    )
    .run(tvId, profileId, at, by);
}

/** Record that the hub launched a Roku channel on a TV (a title, a trailer, or the Popcorn Pilot channel). */
export function noteLaunch(tvId: number, channelId: string, at: number): void {
  getDb()
    .prepare(
      `INSERT INTO tv_state (tv_id, profile_id, set_at, set_by, expected_app, expected_at) VALUES (?, NULL, ?, 'hub', ?, ?)
       ON CONFLICT (tv_id) DO UPDATE SET expected_app = excluded.expected_app, expected_at = excluded.expected_at`,
    )
    .run(tvId, at, channelId, at);
}

/** The Roku channel id of the Popcorn Pilot channel (sideloaded channels are "dev"). */
export function channelAppId(): string {
  return getSetting('channel_app_id', 'dev');
}

export function addVolumeSteps(tvId: number, n: number): void {
  getDb().prepare('UPDATE tv_state SET volume_steps = max(0, volume_steps + ?) WHERE tv_id = ?').run(n, tvId);
}

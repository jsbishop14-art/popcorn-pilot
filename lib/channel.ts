// What the Popcorn Pilot Roku channel (PP6) asks the hub for, for its own TV: the home screen (the Family Album
// photos for its scrolling background, routines, playlists with cover art, the current profile), now playing with
// up next (the Now playing bridge screen), the picker board of titles, and switching the TV's profile from the
// TV's profile picker. Kid rules apply on the hub: with a kid profile on the TV, only the titles it may watch are
// sent, no routines, and leaving kid mode needs the Adult PIN.
import { EVERYONE, SERVICE_INFO, artUrl, browse, viewerForProfile, type Viewer } from './catalog';
import { listPlaylists } from './playlists';
import { bridgeInfo, switchProfile, tvView, upNextPlace, type Actor } from './playback';
import { getProfile } from './profiles';
import { channelTokenHashOf, getTv, newChannelToken, restoreChannelTokenHash, type Tv } from './tvs';
import { routinesForTv } from './routines';
import { channelAppId, kidModeProfile, noteLaunch, tvState } from './tvstate';
import { albumEntries } from './album';
import { checkPinWithLockout } from './auth';
import { driverFor } from './devices';
import { logActivity } from './activity';
import { getDb } from './db';
import { BadRequest, HttpError } from './route';
import { now } from './clock';
import { hubUrl } from './host';

/** The profile the TV is on: the one the hub set there (a start, a switch), else the TV's default profile. */
export function currentProfileId(tv: Tv): number | null {
  const s = tvState(tv.id);
  if (s && s.set_by !== 'hub') return s.profile_id;
  if (s && s.profile_id !== null) return s.profile_id;
  return tvView(tv).playback?.profileId ?? tv.defaultProfileId;
}

function viewerOn(tv: Tv): Viewer {
  const pid = currentProfileId(tv);
  return pid ? (viewerForProfile(pid) ?? EVERYONE) : EVERYONE;
}

/** Cover art for the channel: the same pictures, from the channel's own route (the channel token reads it). */
export function channelArt(url: string | null): string | null {
  return url ? url.replace(/^\/api\/catalog\/art\//, '/api/channel/art/') : null;
}

/** The actor for something done on the TV without a PIN (a kid picking a title, a profile with no PIN). */
function tvActor(tv: Tv): Actor {
  return { pinType: 'hub', device: `${tv.name} TV` };
}

export function channelHome(tv: Tv) {
  const pid = currentProfileId(tv);
  const p = pid ? getProfile(pid) : null;
  const viewer = viewerOn(tv);
  const kid = kidModeProfile(tv.id) !== null;
  return {
    tv: { id: tv.id, name: tv.name, room: tv.room },
    profile: p ? { id: p.id, name: p.name, color: p.color, initial: p.initial, type: p.type } : null,
    kidMode: kid,
    // The scrolling background (handoff 8.3): the album's photos, shuffled. Empty until the album has synced.
    background: albumEntries({ photosOnly: true }).map((e) => ({ id: e.id, url: e.url, width: e.width, height: e.height })),
    routines: kid ? [] : routinesForTv(tv.id),
    playlists: listPlaylists(viewer).map((pl) => ({
      id: pl.id,
      name: pl.name,
      count: `${pl.items.length} title${pl.items.length === 1 ? '' : 's'}`,
      meta: pl.meta.split(' · ').slice(1).join(' · '),
      covers: pl.covers.map(channelArt),
    })),
    keepWatching: kid && pid ? keepWatching(pid, viewer) : null,
  };
}

/** Kid home "Keep watching": the playlist this kid played last (on any TV), when it still has titles for them. */
function keepWatching(profileId: number, viewer: Viewer): { playlistId: number; name: string } | null {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT pb.playlist_id AS id FROM playback pb JOIN playlists p ON p.id = pb.playlist_id
       WHERE pb.profile_id = ? AND p.deleted_at IS NULL AND p.quick = 0 ORDER BY pb.started_at DESC, pb.id DESC LIMIT 5`,
    )
    .all(profileId) as { id: number }[];
  const lists = listPlaylists(viewer);
  for (const r of rows) {
    const pl = lists.find((x) => x.id === r.id);
    if (pl) return { playlistId: pl.id, name: pl.name };
  }
  return null;
}

export function channelNowPlaying(tv: Tv) {
  const pb = tvView(tv).playback;
  if (!pb) return { nowPlaying: null, upNext: null, bridge: null };
  const n = pb.now;
  const next = pb.upNext[0] ?? null;
  return {
    nowPlaying: {
      playlist: pb.name,
      state: pb.state,
      position: pb.index ? `${pb.index} of ${pb.count}` : null,
      title: n ? { name: n.item.name, service: n.item.serviceName, poster: channelArt(n.item.poster), mode: n.item.modeLabel, episode: n.episode, episodes: n.episodes, percent: n.percent, leftMin: n.leftMin } : null,
    },
    upNext: next
      ? {
          name: next.name,
          service: next.serviceName,
          poster: channelArt(next.poster),
          mode: next.modeLabel,
          minutes: next.minutes,
          position: upNextPlace(tv),
        }
      : null,
    // While the bridge screen is up: seconds until the next title, and for a kid the time warning (handoff 9.5).
    bridge: bridgeInfo(tv),
  };
}

// ---------------------------------------------------------------------------------------------- picker board

/** Tiles on the picker board: 6 for a kid (Josh, 21:57: "6 for kid. more for adult. whatever fits"). */
export const KID_BOARD = 6;
/** An adult profile's board at 1080p: 6 across, 2 rows. */
export const ADULT_BOARD = 12;

export interface BoardTile {
  key: string;
  name: string;
  poster: string | null;
  service: string;
  serviceName: string;
  rating: string | null;
}

/**
 * The picker board for the TV's profile: the titles in the household's playlists that this profile may watch (set
 * on the computer or phone; the remote picks), in playlist order, then filled from the catalog's titles it may
 * watch. Kid rules are applied on the hub: a kid profile never gets a title its rules do not allow.
 */
export async function channelBoard(tv: Tv): Promise<{ kid: boolean; tiles: BoardTile[] }> {
  const viewer = viewerOn(tv);
  const size = viewer.kid ? KID_BOARD : ADULT_BOARD;
  const tiles: BoardTile[] = [];
  const seen = new Set<string>();
  for (const pl of listPlaylists(viewer)) {
    for (const it of pl.items) {
      if (tiles.length >= size) break;
      if (it.kind !== 'title' || !it.titleKey || !it.service || seen.has(it.titleKey)) continue;
      seen.add(it.titleKey);
      tiles.push({ key: it.titleKey, name: it.name, poster: channelArt(artUrl(it.poster)), service: it.service, serviceName: SERVICE_INFO[it.service].name, rating: it.rating });
    }
  }
  if (tiles.length < size) {
    try {
      const rows = await browse(viewer, { service: 'all', kind: 'all', q: '' });
      // Take from the platforms in turn, so the board mixes them.
      for (let i = 0; tiles.length < size && rows.some((r) => r.titles[i]); i++) {
        for (const r of rows) {
          const t = r.titles[i];
          if (!t || seen.has(t.key) || tiles.length >= size) continue;
          seen.add(t.key);
          tiles.push({ key: t.key, name: t.name, poster: channelArt(t.poster), service: r.service, serviceName: SERVICE_INFO[r.service].name, rating: t.rating });
        }
      }
    } catch {
      // the catalog is not reachable: the playlists' titles only
    }
  }
  return { kid: viewer.kid, tiles };
}

/** The viewer and actor a title picked on the TV starts with. */
export function pickerStart(tv: Tv): { viewer: Viewer; actor: Actor } {
  return { viewer: viewerOn(tv), actor: tvActor(tv) };
}

// ---------------------------------------------------------------------------------------------- profile picker

/**
 * Switch the TV's profile from its profile picker (handoff 3.4 and 9.3). In kid mode, any switch needs the Adult
 * PIN (leaving kid mode). Otherwise: a kid profile needs no PIN; an adult profile needs the Adult PIN; Guest (no
 * profile) needs a PIN, Adult or Guest (the TV is already out of kid mode). Wrong PINs count toward the hub-wide
 * lockout. Body: { profileId: number | null, pin?: string }.
 */
export async function channelSwitchProfile(tv: Tv, b: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const raw = b.profileId;
  let target: { id: number; name: string; kid: boolean } | null = null;
  if (raw !== null && raw !== undefined) {
    const n = Number(raw);
    const p = Number.isInteger(n) && n > 0 ? getProfile(n) : null;
    if (!p) throw new BadRequest('That profile does not exist.');
    target = { id: p.id, name: p.name, kid: p.type === 'kid' };
  }
  const fromKid = kidModeProfile(tv.id);
  if (fromKid !== null && target?.id === fromKid) return { status: 200, body: { ok: true, message: `${tv.name} is already on ${target.name}` } };
  const need: ('adult' | 'guest')[] | null = fromKid !== null || (target && !target.kid) ? ['adult'] : target === null ? ['adult', 'guest'] : null;
  let actor = tvActor(tv);
  const device = `${tv.name} TV`;
  if (need) {
    if (b.pin === undefined || b.pin === null || b.pin === '') {
      return { status: 401, body: { error: fromKid !== null ? 'Leaving kid mode needs the Adult PIN.' : 'Enter the PIN.', needPin: need.includes('guest') ? 'any' : 'adult' } };
    }
    const pin = await checkPinWithLockout(b.pin, device);
    if (pin.status === 'locked') return { status: 429, body: { error: 'PIN entry is locked for a minute after wrong tries.', lockedUntil: pin.lockedUntil } };
    if (pin.status === 'not_set_up') return { status: 409, body: { error: 'The PINs are not set up yet.' } };
    if (pin.status === 'wrong') return { status: 403, body: { error: 'Wrong PIN.', triesLeft: pin.triesLeft } };
    if (!need.includes(pin.pinType)) return { status: 403, body: { error: fromKid !== null ? 'Leaving kid mode needs the Adult PIN.' : 'This profile needs the Adult PIN.' } };
    actor = { pinType: pin.pinType, device };
  }
  const words = await switchProfile(actor, tv.id, target ? target.id : null, { checkedOnTv: true });
  return { status: 200, body: { ok: true, message: words } };
}

// ---------------------------------------------------------------------------------------------- pairing

/**
 * Pair the Popcorn Pilot channel on a TV: a new channel token (the old one stops working), handed to the channel
 * with the hub address by opening it on the TV (Roku launch parameters). The channel keeps both; no PIN is stored
 * on the TV. When the TV does not answer, the old token is put back and nothing changes.
 */
export async function pairChannel(tvId: number, who: { pinType: 'adult'; device: string }): Promise<string> {
  const tv = getTv(tvId);
  if (!tv) throw new HttpError(404, 'No such TV.');
  const before = channelTokenHashOf(tv.id);
  const token = newChannelToken(tv.id) as string;
  try {
    const id = channelAppId();
    noteLaunch(tv.id, id, now());
    await driverFor(tv).launch({ channelId: id, contentId: 'pair', params: { pp_hub: hubUrl(), pp_token: token } });
  } catch (err) {
    restoreChannelTokenHash(tv.id, before);
    throw new HttpError(502, `${tv.name} did not open the Popcorn Pilot channel (${err instanceof Error ? err.message.replace(/\.$/, '') : 'no answer'}). Check the channel is installed and the TV is on.`);
  }
  const words = `Paired the Popcorn Pilot channel on ${tv.name}`;
  logActivity({ pinType: who.pinType, device: who.device, action: 'tv.channel_pair', summary: words });
  return words;
}

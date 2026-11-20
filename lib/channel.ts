// What the Popcorn Pilot Roku channel (PP6) asks the hub for, for its own TV: the home screen (the Family Album
// photos for its scrolling background, routines, playlists with cover art, the current profile) and now playing with
// up next (the Now playing bridge screen). Kid rules apply on the hub: with a kid profile on the TV, only the titles
// it may watch are sent, and no routines (leaving kid mode needs the Adult PIN).
import { EVERYONE, viewerForProfile } from './catalog';
import { listPlaylists } from './playlists';
import { tvView } from './playback';
import { getProfile } from './profiles';
import type { Tv } from './tvs';
import { routinesForTv } from './routines';
import { kidModeProfile } from './tvstate';
import { albumEntries } from './album';

function currentProfileId(tv: Tv): number | null {
  return tvView(tv).playback?.profileId ?? tv.defaultProfileId;
}

export function channelHome(tv: Tv) {
  const pid = currentProfileId(tv);
  const p = pid ? getProfile(pid) : null;
  const viewer = p ? (viewerForProfile(p.id) ?? EVERYONE) : EVERYONE;
  return {
    tv: { id: tv.id, name: tv.name, room: tv.room },
    profile: p ? { id: p.id, name: p.name, color: p.color, initial: p.initial, type: p.type } : null,
    // The scrolling background (handoff 8.3): the album's photos, shuffled. Empty until the album has synced.
    background: albumEntries({ photosOnly: true }).map((e) => ({ id: e.id, url: e.url, width: e.width, height: e.height })),
    routines: kidModeProfile(tv.id) !== null ? [] : routinesForTv(tv.id),
    playlists: listPlaylists(viewer).map((pl) => ({
      id: pl.id,
      name: pl.name,
      count: `${pl.items.length} title${pl.items.length === 1 ? '' : 's'}`,
      meta: pl.meta.split(' · ').slice(1).join(' · '),
      covers: pl.covers,
    })),
  };
}

export function channelNowPlaying(tv: Tv) {
  const pb = tvView(tv).playback;
  if (!pb) return { nowPlaying: null, upNext: null };
  const n = pb.now;
  const next = pb.upNext[0] ?? null;
  return {
    nowPlaying: {
      playlist: pb.name,
      state: pb.state,
      position: pb.index ? `${pb.index} of ${pb.count}` : null,
      title: n ? { name: n.item.name, service: n.item.serviceName, poster: n.item.poster, mode: n.item.modeLabel, episode: n.episode, episodes: n.episodes, percent: n.percent, leftMin: n.leftMin } : null,
    },
    upNext: next ? { name: next.name, service: next.serviceName, poster: next.poster, mode: next.modeLabel, position: pb.index ? `${pb.index + 1} of ${pb.count}` : null } : null,
  };
}

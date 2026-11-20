// What the Popcorn Pilot Roku channel (PP6) asks the hub for, for its own TV: the home screen (routines, playlists
// with cover art, the current profile) and now playing with up next (the Now playing bridge screen). Kid rules apply
// on the hub: with a kid profile on the TV, only the titles it may watch are sent.
import { EVERYONE, viewerForProfile } from './catalog';
import { listPlaylists } from './playlists';
import { tvView } from './playback';
import { getProfile } from './profiles';
import type { Tv } from './tvs';

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
    // Routines arrive in PP5; the list is empty until then.
    routines: [] as { id: number; name: string }[],
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

import { route, json, body, idParam } from '@/lib/route';
import { actorOf, allTvViews, startPlaylist } from '@/lib/playback';

export const dynamic = 'force-dynamic';

// Start a playlist on one or both TVs. Body: { tvIds: [..], profile? } (no profile: each TV's default profile). The
// Guest PIN starts for a kid profile only.
export const POST = route('POST /api/playlists/[id]/start', async (req, auth, ctx) => {
  const b = await body(req);
  await startPlaylist(actorOf(auth), { playlistId: idParam(ctx), tvIds: b.tvIds, profile: b.profile });
  return json({ tvs: allTvViews() });
});

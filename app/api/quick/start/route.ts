import { route, json, body, HttpError } from '@/lib/route';
import { quickId } from '@/lib/playlists';
import { actorOf, allTvViews, startPlaylist } from '@/lib/playback';

export const dynamic = 'force-dynamic';

// Start the quick playlist on a TV. Body: { tvId, profile? }.
export const POST = route('POST /api/quick/start', async (req, auth) => {
  const b = await body(req);
  const id = quickId(false);
  if (id === null) throw new HttpError(404, 'Pick a title first.');
  await startPlaylist(actorOf(auth), { playlistId: id, tvIds: [b.tvId], profile: b.profile });
  return json({ tvs: allTvViews() });
});

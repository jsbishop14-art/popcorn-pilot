import { route, json, fail, idParam } from '@/lib/route';
import { getTv } from '@/lib/tvs';
import { startPlaylist } from '@/lib/playback';
import { currentProfileId, pickerStart } from '@/lib/channel';

export const dynamic = 'force-dynamic';

// The TV home screen's Playlists row and kid home "Keep watching" (PP6): start a playlist on this TV for the TV's
// profile. The kid rules apply on the hub (titles the kid may not watch are never launched; time and hours).
export const POST = route('POST /api/channel/playlists/[id]/start', async (_req, auth, ctx) => {
  const tv = auth.tvId ? getTv(auth.tvId) : null;
  if (!tv) return fail(401, 'Unknown TV.');
  const { actor } = pickerStart(tv);
  await startPlaylist(actor, { playlistId: idParam(ctx), tvIds: [tv.id], profile: currentProfileId(tv) ?? undefined });
  return json({ ok: true });
});

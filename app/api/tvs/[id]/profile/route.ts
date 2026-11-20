import { route, json, body, idParam } from '@/lib/route';
import { actorOf, allTvViews, switchProfile } from '@/lib/playback';

export const dynamic = 'force-dynamic';

// Switch a TV to a profile (kid mode for a kid profile). Body: { profileId } (null: no profile, Adult PIN only).
// The Guest PIN switches to a kid profile only.
export const POST = route('POST /api/tvs/[id]/profile', async (req, auth, ctx) => {
  const b = await body(req);
  const words = await switchProfile(actorOf(auth), idParam(ctx), b.profileId);
  return json({ ok: true, message: words, tvs: allTvViews() });
});

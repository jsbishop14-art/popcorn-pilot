import { route, json, fail, body } from '@/lib/route';
import { getTv } from '@/lib/tvs';
import { channelSwitchProfile } from '@/lib/channel';

export const dynamic = 'force-dynamic';

// The TV's profile picker (PP6): { profileId: number | null, pin? }. Kid profiles need no PIN; adult profiles need
// the Adult PIN; Guest (no profile) needs a PIN; in kid mode every switch needs the Adult PIN (leaving kid mode).
export const POST = route('POST /api/channel/profile', async (req, auth) => {
  const tv = auth.tvId ? getTv(auth.tvId) : null;
  if (!tv) return fail(401, 'Unknown TV.');
  const r = await channelSwitchProfile(tv, await body(req));
  return json(r.body, r.status);
});

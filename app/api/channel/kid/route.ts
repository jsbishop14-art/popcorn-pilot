import { route, json, fail } from '@/lib/route';
import { getTv } from '@/lib/tvs';
import { channelKid } from '@/lib/requests';
import { now } from '@/lib/clock';

export const dynamic = 'force-dynamic';

// The channel's kid screens for its own TV (PP6): time left and its bar, the warning, tasks and the weekly bonus,
// and the kid's waiting requests. { kidMode: false } when the TV is not in kid mode.
export const GET = route('GET /api/channel/kid', (_req, auth) => {
  const tv = auth.tvId ? getTv(auth.tvId) : null;
  if (!tv) return fail(401, 'Unknown TV.');
  return json(channelKid(tv.id, now()));
});

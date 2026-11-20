import { route, json, fail } from '@/lib/route';
import { getTv } from '@/lib/tvs';
import { channelBoard } from '@/lib/channel';

export const dynamic = 'force-dynamic';

// The picker board for the TV's profile (PP6): 6 tiles for a kid, more for an adult; only titles it may watch.
export const GET = route('GET /api/channel/board', async (_req, auth) => {
  const tv = auth.tvId ? getTv(auth.tvId) : null;
  if (!tv) return fail(401, 'Unknown TV.');
  return json(await channelBoard(tv));
});

import { route, json, fail, idParam } from '@/lib/route';
import { getTv } from '@/lib/tvs';
import { runFromChannel } from '@/lib/routines';

export const dynamic = 'force-dynamic';

// The TV home screen's Routines row (PP6): run a routine for this TV. Refused while the TV is in kid mode.
export const POST = route('POST /api/channel/routines/[id]/run', async (_req, auth, ctx) => {
  const tv = auth.tvId ? getTv(auth.tvId) : null;
  if (!tv) return fail(401, 'Unknown TV.');
  const result = await runFromChannel(tv, idParam(ctx));
  return json({ result });
});

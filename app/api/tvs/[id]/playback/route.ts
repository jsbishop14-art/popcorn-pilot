import { route, json, body, idParam } from '@/lib/route';
import { actorOf, control, allTvViews } from '@/lib/playback';

export const dynamic = 'force-dynamic';

// Pause, resume, skip or stop what this TV is playing. Body: { action }.
export const POST = route('POST /api/tvs/[id]/playback', async (req, auth, ctx) => {
  const b = await body(req);
  const words = await control(actorOf(auth), idParam(ctx), b.action);
  return json({ ok: true, message: words, tvs: allTvViews() });
});

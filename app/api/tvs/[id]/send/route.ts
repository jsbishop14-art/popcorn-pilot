import { route, json, body, idParam } from '@/lib/route';
import { actorOf, allTvViews, sendTo } from '@/lib/playback';

export const dynamic = 'force-dynamic';

// Send to: pause on this TV, resume on the other. Body: { toTvId }.
export const POST = route('POST /api/tvs/[id]/send', async (req, auth, ctx) => {
  const b = await body(req);
  const words = await sendTo(actorOf(auth), idParam(ctx), b.toTvId);
  return json({ ok: true, message: words, tvs: allTvViews() });
});

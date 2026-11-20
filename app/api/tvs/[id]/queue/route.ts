import { route, json, body, idParam } from '@/lib/route';
import { actorOf, allTvViews, editQueue } from '@/lib/playback';

export const dynamic = 'force-dynamic';

// Change this TV's live queue. Body: { action: 'move', itemId, direction: 'up' | 'down' } | { action: 'remove',
// itemId } | { action: 'mode', itemId, mode, episodes?, minutes? } | { action: 'add', titleKey, service?, mode? }.
export const POST = route('POST /api/tvs/[id]/queue', async (req, auth, ctx) => {
  const b = await body(req);
  const words = await editQueue(actorOf(auth), idParam(ctx), b);
  return json({ ok: true, message: words, tvs: allTvViews() });
});

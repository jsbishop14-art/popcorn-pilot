import { route, json, fail, body } from '@/lib/route';
import { getTv } from '@/lib/tvs';
import { bridgeAction } from '@/lib/playback';

export const dynamic = 'force-dynamic';

// The Now playing bridge screen's buttons (PP6): { action: 'play' | 'skip' }. Only while the bridge is up.
export const POST = route('POST /api/channel/bridge', async (req, auth) => {
  const tv = auth.tvId ? getTv(auth.tvId) : null;
  if (!tv) return fail(401, 'Unknown TV.');
  const b = await body(req);
  return json({ ok: true, message: await bridgeAction(tv.id, b.action) });
});

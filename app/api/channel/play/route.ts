import { route, json, fail, body } from '@/lib/route';
import { getTv } from '@/lib/tvs';
import { startTitle } from '@/lib/playback';
import { pickerStart } from '@/lib/channel';

export const dynamic = 'force-dynamic';

// A title picked on the TV's picker board (PP6): { titleKey, service? }. It plays for the TV's profile; for a kid,
// only a title its rules allow, within viewing hours and time left (checked on the hub).
export const POST = route('POST /api/channel/play', async (req, auth) => {
  const tv = auth.tvId ? getTv(auth.tvId) : null;
  if (!tv) return fail(401, 'Unknown TV.');
  const b = await body(req);
  const { viewer, actor } = pickerStart(tv);
  const r = await startTitle(actor, viewer, { tvId: tv.id, titleKey: b.titleKey, service: b.service });
  return json({ ok: true, message: `Started ${r.name} on ${r.tvName}` });
});

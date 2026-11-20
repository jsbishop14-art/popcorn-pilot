import { route, json, fail, body } from '@/lib/route';
import { getTv } from '@/lib/tvs';
import { createRequest } from '@/lib/requests';
import { now } from '@/lib/clock';

export const dynamic = 'force-dynamic';

// A kid asks from the TV: { kind: 'time', minutes } | { kind: 'title', titleKey, service? } | { kind: 'task', taskId }.
// The TV must be in kid mode; the request is for that kid. An adult answers in the app or with the Adult PIN here.
export const POST = route('POST /api/channel/requests', async (req, auth) => {
  const tv = auth.tvId ? getTv(auth.tvId) : null;
  if (!tv) return fail(401, 'Unknown TV.');
  const r = await createRequest(tv.id, await body(req), now());
  return json({ request: { id: r.id, kind: r.kind, status: r.status, title: r.title } }, 201);
});

import { route, json, fail, body, idParam } from '@/lib/route';
import { deleteTv, describeTvChange, getTv, updateTv } from '@/lib/tvs';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = route('GET /api/tvs/[id]', (_req, _auth, ctx) => {
  const tv = getTv(idParam(ctx));
  return tv ? json({ tv }) : fail(404, 'No such TV.');
});

export const PATCH = route('PATCH /api/tvs/[id]', async (req, auth, ctx) => {
  const r = updateTv(idParam(ctx), await body(req));
  if (!r) return fail(404, 'No such TV.');
  logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'tv.update', summary: describeTvChange(r.before, r.after) });
  return json({ tv: r.after });
});

export const DELETE = route('DELETE /api/tvs/[id]', (_req, auth, ctx) => {
  const tv = deleteTv(idParam(ctx));
  if (!tv) return fail(404, 'No such TV.');
  logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'tv.delete', summary: `Removed TV ${tv.name}` });
  return json({ ok: true });
});

import { route, json, fail, body, idParam } from '@/lib/route';
import { deleteProfile, describeProfileChange, getProfile, updateProfile } from '@/lib/profiles';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = route('GET /api/profiles/[id]', (_req, _auth, ctx) => {
  const p = getProfile(idParam(ctx));
  return p ? json({ profile: p }) : fail(404, 'No such profile.');
});

export const PATCH = route('PATCH /api/profiles/[id]', async (req, auth, ctx) => {
  const r = updateProfile(idParam(ctx), await body(req));
  if (!r) return fail(404, 'No such profile.');
  logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'profile.update', summary: describeProfileChange(r.before, r.after) });
  return json({ profile: r.after });
});

export const DELETE = route('DELETE /api/profiles/[id]', (_req, auth, ctx) => {
  const p = deleteProfile(idParam(ctx));
  if (!p) return fail(404, 'No such profile.');
  logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'profile.delete', summary: `Deleted profile ${p.name}` });
  return json({ ok: true });
});

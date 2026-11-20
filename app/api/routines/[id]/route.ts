import { route, json, fail, body, idParam } from '@/lib/route';
import { deleteRoutine, routineOr404, updateRoutine } from '@/lib/routines';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = route('GET /api/routines/[id]', (_req, _auth, ctx) => json({ routine: routineOr404(idParam(ctx)) }));

export const PATCH = route('PATCH /api/routines/[id]', async (req, auth, ctx) => {
  const { routine, changes } = updateRoutine(idParam(ctx), await body(req));
  logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'routine.update', summary: `Edited the routine ${routine.name}${changes.length ? `: ${changes.join(', ')}` : ' (no changes)'}` });
  return json({ routine });
});

export const DELETE = route('DELETE /api/routines/[id]', (_req, auth, ctx) => {
  const r = deleteRoutine(idParam(ctx));
  if (!r) return fail(404, 'No such routine.');
  logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'routine.delete', summary: `Deleted the routine ${r.name}` });
  return json({ ok: true });
});

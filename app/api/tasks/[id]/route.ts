import { route, json, fail, body, idParam } from '@/lib/route';
import { deleteTask, updateTask } from '@/lib/requests';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const PATCH = route('PATCH /api/tasks/[id]', async (req, auth, ctx) => {
  const { before, after } = updateTask(idParam(ctx), await body(req));
  const parts: string[] = [];
  if (before.name !== after.name) parts.push(`renamed ${before.name} to ${after.name}`);
  if (before.minutes !== after.minutes) parts.push(`+${after.minutes} min`);
  if (before.picture !== after.picture) parts.push('new picture');
  logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'task.update', summary: `Changed task ${after.name}${parts.length ? `: ${parts.join(', ')}` : ' (no changes)'}` });
  return json({ task: after });
});

export const DELETE = route('DELETE /api/tasks/[id]', (_req, auth, ctx) => {
  const t = deleteTask(idParam(ctx));
  if (!t) return fail(404, 'No such task.');
  logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'task.delete', summary: `Deleted task ${t.name}` });
  return json({ ok: true });
});

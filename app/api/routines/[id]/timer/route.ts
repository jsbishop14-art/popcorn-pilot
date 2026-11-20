import { route, json, fail, idParam } from '@/lib/route';
import { cancelTimer, getRoutine } from '@/lib/routines';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Cancel a routine's timer before it turns the TV off.
export const DELETE = route('DELETE /api/routines/[id]/timer', (_req, auth, ctx) => {
  const id = idParam(ctx);
  const words = cancelTimer(id, auth.role === 'adult' ? 'the Adult PIN' : 'the app');
  if (!words) return fail(404, 'This routine has no timer waiting.');
  logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'routine.timer_cancel', summary: words });
  return json({ ok: true, routine: getRoutine(id) });
});

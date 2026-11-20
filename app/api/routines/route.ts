import { route, json, body } from '@/lib/route';
import { createRoutine, listRoutines } from '@/lib/routines';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Routines (mockup Routines): the list with each one's schedule, TV, profile and last run. Adult PIN only.
export const GET = route('GET /api/routines', () => json({ routines: listRoutines() }));

export const POST = route('POST /api/routines', async (req, auth) => {
  const { routine, words } = createRoutine(await body(req));
  logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'routine.create', summary: words });
  return json({ routine }, 201);
});

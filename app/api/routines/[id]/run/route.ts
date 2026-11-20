import { route, json, idParam } from '@/lib/route';
import { getRoutine, runRoutine } from '@/lib/routines';

export const dynamic = 'force-dynamic';

// Run (mockup Routines): every step in order on the routine's TV; the answer says what each step did, or where it
// stopped and why.
export const POST = route('POST /api/routines/[id]/run', async (_req, auth, ctx) => {
  const id = idParam(ctx);
  const result = await runRoutine(id, { by: 'adult', device: auth.device });
  return json({ result, routine: getRoutine(id) });
});

import { route, json, body, idParam } from '@/lib/route';
import { adultMarksDone, kidTasks } from '@/lib/requests';
import { now } from '@/lib/clock';

export const dynamic = 'force-dynamic';

// An adult marks a task done for a kid: the minutes are added now, up to the weekly bonus cap. Body: { profileId }.
export const POST = route('POST /api/tasks/[id]/done', async (req, auth, ctx) => {
  const b = await body(req);
  const at = now();
  const words = adultMarksDone(idParam(ctx), b.profileId, { device: auth.device }, at);
  return json({ ok: true, message: words, kid: kidTasks(Number(b.profileId), at) });
});

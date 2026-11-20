import { route, json, body } from '@/lib/route';
import { createTask, kidTasks, listTasks } from '@/lib/requests';
import { kidSummaries } from '@/lib/kid-views';
import { PICTURES } from '@/lib/safeguards';
import { now } from '@/lib/clock';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Earn time tasks (mockup Tasks): the tasks, and for each kid profile today's state of each task and the weekly bonus.
export const GET = route('GET /api/tasks', () => {
  const at = now();
  return json({ tasks: listTasks(), kids: kidSummaries(at).map((k) => kidTasks(k.id, at)), pictures: PICTURES });
});

export const POST = route('POST /api/tasks', async (req, auth) => {
  const t = createTask(await body(req));
  logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'task.create', summary: `Added task ${t.name} (+${t.minutes} min)` });
  return json({ task: t }, 201);
});

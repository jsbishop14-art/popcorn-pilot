import { route, json, body, idParam } from '@/lib/route';
import { decide, listRequests, playApprovedTitle } from '@/lib/requests';
import { now } from '@/lib/clock';

export const dynamic = 'force-dynamic';

// Approve or deny a request in the app. Body: { decision: 'approve' | 'deny' }.
export const POST = route('POST /api/requests/[id]', async (req, auth, ctx) => {
  const b = await body(req);
  const id = idParam(ctx);
  const r = decide(id, b.decision, { device: auth.device }, now());
  const played = r.view.kind === 'title' && r.view.status === 'approved' ? await playApprovedTitle(id) : null;
  return json({ ok: true, message: played ? `${r.words}. ${played}` : r.words, ...listRequests(now()) });
});

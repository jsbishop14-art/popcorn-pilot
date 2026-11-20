import { route, json, fail, body, idParam } from '@/lib/route';
import { getTv } from '@/lib/tvs';
import { checkPinWithLockout } from '@/lib/auth';
import { decide, listRequests, playApprovedTitle } from '@/lib/requests';
import { now } from '@/lib/clock';

export const dynamic = 'force-dynamic';

// An adult answers a request on the TV with the Adult PIN: { pin, decision: 'approve' | 'deny' }. Only requests made
// on this TV. The Guest PIN cannot approve; wrong PINs count toward the hub-wide lockout.
export const POST = route('POST /api/channel/requests/[id]', async (req, auth, ctx) => {
  const tv = auth.tvId ? getTv(auth.tvId) : null;
  if (!tv) return fail(401, 'Unknown TV.');
  const id = idParam(ctx);
  const b = await body(req);
  if (!listRequests(now(), { tvId: tv.id }).pending.some((r) => r.id === id)) return fail(404, 'No such request waiting on this TV.');
  const device = `${tv.name} TV`;
  const pin = await checkPinWithLockout(b.pin, device);
  if (pin.status === 'locked') return json({ error: 'PIN entry is locked for a minute after wrong tries.', lockedUntil: pin.lockedUntil }, 429);
  if (pin.status === 'not_set_up') return fail(409, 'The PINs are not set up yet.');
  if (pin.status === 'wrong') return json({ error: 'Wrong PIN.', triesLeft: pin.triesLeft }, 403);
  if (pin.pinType !== 'adult') return fail(403, 'Approvals need the Adult PIN.');
  const r = decide(id, b.decision, { device }, now());
  const played = r.view.kind === 'title' && r.view.status === 'approved' ? await playApprovedTitle(id) : null;
  return json({ ok: true, message: played ? `${r.words}. ${played}` : r.words });
});

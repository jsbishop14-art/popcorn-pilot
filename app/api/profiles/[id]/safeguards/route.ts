import { route, json, body, idParam } from '@/lib/route';
import { RATINGS, kidRulesOr404, timeStatus, updateRules } from '@/lib/safeguards';
import { blockedList } from '@/lib/kid-views';
import { now } from '@/lib/clock';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// A kid profile's safeguards (mockup ProfileEditor), with its block list by name and its time today.
export const GET = route('GET /api/profiles/[id]/safeguards', async (_req, _auth, ctx) => {
  const rules = kidRulesOr404(idParam(ctx));
  return json({ rules, ratings: RATINGS, blocked: await blockedList(rules), time: timeStatus(rules, now()) });
});

export const PATCH = route('PATCH /api/profiles/[id]/safeguards', async (req, auth, ctx) => {
  const id = idParam(ctx);
  const { rules, changes } = updateRules(id, await body(req));
  if (changes.length) {
    const s = changes.join(', ');
    logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'safeguards.update', summary: `Changed ${rules.name}'s safeguards: ${s}` });
  }
  return json({ rules, changes, blocked: await blockedList(rules), time: timeStatus(rules, now()) });
});

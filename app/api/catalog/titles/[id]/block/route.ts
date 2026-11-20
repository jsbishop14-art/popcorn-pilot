import { route, json, body, BadRequest } from '@/lib/route';
import { setTag, titleForTag } from '@/lib/catalog';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Block for kids: hidden from every kid profile, whatever its ratings. Body: { blocked: true | false }.
export const POST = route('POST /api/catalog/titles/[id]/block', async (req, auth, ctx) => {
  const b = await body(req);
  if (typeof b.blocked !== 'boolean') throw new BadRequest('Say blocked: true or false.');
  const t = await titleForTag(ctx.params.id);
  if (setTag(t, 'blocked', b.blocked))
    logActivity({
      pinType: auth.role as PinType,
      device: auth.device,
      action: b.blocked ? 'title.block' : 'title.unblock',
      summary: b.blocked ? `Blocked ${t.name} for kids` : `Unblocked ${t.name} for kids`,
    });
  return json({ key: t.key, blocked: b.blocked });
});

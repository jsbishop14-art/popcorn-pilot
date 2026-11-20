import { route, json, body, BadRequest } from '@/lib/route';
import { setTag, titleForTag } from '@/lib/catalog';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Tag as calm (handoff 5.11: bedtime wind-down plays only calm titles). Body: { calm: true | false }.
export const POST = route('POST /api/catalog/titles/[id]/calm', async (req, auth, ctx) => {
  const b = await body(req);
  if (typeof b.calm !== 'boolean') throw new BadRequest('Say calm: true or false.');
  const t = await titleForTag(ctx.params.id);
  if (setTag(t, 'calm', b.calm))
    logActivity({
      pinType: auth.role as PinType,
      device: auth.device,
      action: b.calm ? 'title.calm' : 'title.uncalm',
      summary: b.calm ? `Tagged ${t.name} as calm` : `Removed the calm tag from ${t.name}`,
    });
  return json({ key: t.key, calm: b.calm });
});

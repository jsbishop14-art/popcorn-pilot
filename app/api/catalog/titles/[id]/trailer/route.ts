import { route, json, body } from '@/lib/route';
import { trailerOnTv, viewerFor } from '@/lib/catalog';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Trailer on TV: opens the YouTube channel on the chosen Roku with the trailer. Body: { tvId, profile }.
export const POST = route('POST /api/catalog/titles/[id]/trailer', async (req, auth, ctx) => {
  const b = await body(req);
  const viewer = viewerFor(auth, b.profile);
  const r = await trailerOnTv(viewer, ctx.params.id, { tvId: b.tvId });
  logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'title.trailer', summary: `Sent the ${r.title.name} trailer to ${r.tvName} (YouTube)` });
  return json({ ok: true, tv: r.tvName });
});

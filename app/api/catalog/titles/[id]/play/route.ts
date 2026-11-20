import { route, json, body } from '@/lib/route';
import { SERVICE_INFO, playOnTv, viewerFor } from '@/lib/catalog';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ROUTE_WORDS = { deep_link: 'direct link', search: 'search launch' } as const;

// Play on a TV. Body: { tvId, profile, service?, startFrom? }. The kid rules of `profile` apply.
export const POST = route('POST /api/catalog/titles/[id]/play', async (req, auth, ctx) => {
  const b = await body(req);
  const viewer = viewerFor(auth, b.profile);
  const r = await playOnTv(viewer, ctx.params.id, { tvId: b.tvId, service: b.service });
  const from = typeof b.startFrom === 'string' && b.startFrom.length <= 60 ? `, start from ${b.startFrom}` : '';
  const who = viewer.profileName ? ` for ${viewer.profileName}` : '';
  const service = r.service === 'youtube' ? 'YouTube' : SERVICE_INFO[r.service].name;
  logActivity({
    pinType: auth.role as PinType,
    device: auth.device,
    action: 'title.play',
    summary: `Played ${r.title.name} on ${r.tvName}${who} (${service}, ${ROUTE_WORDS[r.route]}${from})`,
  });
  return json({ ok: true, tv: r.tvName, service: r.service, route: r.route });
});

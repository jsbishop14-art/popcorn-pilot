import { route, json, body } from '@/lib/route';
import { SERVICE_INFO, playOnTv, viewerFor, type Service } from '@/lib/catalog';
import { actorOf, startTitle } from '@/lib/playback';
import type { LaunchRoute } from '@/lib/devices/types';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ROUTE_WORDS = { deep_link: 'direct link', search: 'search launch' } as const;

// Play on a TV. Body: { tvId, profile, service?, startFrom? }. The kid rules of `profile` apply.
export const POST = route('POST /api/catalog/titles/[id]/play', async (req, auth, ctx) => {
  const b = await body(req);
  const viewer = viewerFor(auth, b.profile);
  // PP4: for a kid profile the title plays as a playback, so the kid rules apply to it (time counted, the warning,
  // the stop, snap back). Otherwise it is a plain launch, as before.
  const r = viewer.kid
    ? await (async () => {
        const s = await startTitle(actorOf(auth), viewer, { tvId: b.tvId, titleKey: ctx.params.id, service: b.service });
        return { title: { name: s.name }, tvName: s.tvName, service: s.service as Service, route: s.route as LaunchRoute };
      })()
    : await playOnTv(viewer, ctx.params.id, { tvId: b.tvId, service: b.service });
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

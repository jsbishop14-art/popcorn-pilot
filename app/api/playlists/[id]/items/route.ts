import { route, json, body, idParam } from '@/lib/route';
import { EVERYONE } from '@/lib/catalog';
import { albumFields, appendItem, modeLabel, playlistOr404, titleFields } from '@/lib/playlists';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Add to playlist. Body: { titleKey, service?, mode?, episodes?, minutes?, startFrom? } or { kind: 'album' }.
export const POST = route('POST /api/playlists/[id]/items', async (req, auth, ctx) => {
  const id = idParam(ctx);
  const p = playlistOr404(id, EVERYONE);
  const b = await body(req);
  const f = b.kind === 'album' ? albumFields(b) : await titleFields(EVERYONE, b.titleKey, b.service, b, b.startFrom);
  appendItem(id, f);
  logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'playlist.add', summary: `Added ${f.name} to the playlist ${p.name} (${modeLabel(f)})` });
  return json({ playlist: playlistOr404(id, EVERYONE) }, 201);
});

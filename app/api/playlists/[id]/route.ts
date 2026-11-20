import { route, json, body, idParam, fail } from '@/lib/route';
import { EVERYONE, viewerFor } from '@/lib/catalog';
import { deletePlaylist, getPlaylist, playlistOr404, updatePlaylist } from '@/lib/playlists';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = route('GET /api/playlists/[id]', (req, auth, ctx) => {
  const viewer = viewerFor(auth, new URL(req.url).searchParams.get('profile'));
  return json({ playlist: playlistOr404(idParam(ctx), viewer) });
});

// Save the editor: { name?, loop?, shuffle?, schedule?: { on, days, time, tvId, profileId }, items?: [{ id, mode,
// episodes, minutes }] in the new order }.
export const PATCH = route('PATCH /api/playlists/[id]', async (req, auth, ctx) => {
  const id = idParam(ctx);
  const before = getPlaylist(id, EVERYONE);
  const r = updatePlaylist(id, await body(req));
  logActivity({
    pinType: auth.role as PinType,
    device: auth.device,
    action: 'playlist.edit',
    summary: r.changes.length ? `Edited the playlist ${before?.name ?? r.playlist.name}: ${r.changes.join(', ')}` : `Saved the playlist ${r.playlist.name} (no changes)`,
  });
  return json({ playlist: r.playlist });
});

export const DELETE = route('DELETE /api/playlists/[id]', (_req, auth, ctx) => {
  const r = deletePlaylist(idParam(ctx));
  if (!r) return fail(404, 'No such playlist.');
  logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'playlist.delete', summary: `Deleted the playlist ${r.name}` });
  return json({ ok: true });
});

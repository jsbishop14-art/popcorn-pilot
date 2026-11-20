import { route, json, body } from '@/lib/route';
import { saveQuick } from '@/lib/playlists';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Save as playlist. Body: { name }.
export const POST = route('POST /api/quick/save', async (req, auth) => {
  const b = await body(req);
  const p = saveQuick(b.name);
  logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'quick.save', summary: `Saved the quick playlist as ${p.name} (${p.items.length} titles)` });
  return json({ playlist: p }, 201);
});

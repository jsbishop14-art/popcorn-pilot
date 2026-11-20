import { route, json } from '@/lib/route';
import { requestUpdate } from '@/lib/hub';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Check for updates now: the Pi updater picks up the request within a few seconds.
export const POST = route('POST /api/hub/update', (_req, auth) => {
  requestUpdate();
  logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'hub.update_check', summary: 'Asked the hub to check for updates now' });
  return json({ ok: true }, 202);
});

import { route, json, body } from '@/lib/route';
import { createProfile, listProfiles } from '@/lib/profiles';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = route('GET /api/profiles', () => json({ profiles: listProfiles() }));

export const POST = route('POST /api/profiles', async (req, auth) => {
  const p = createProfile(await body(req));
  logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'profile.create', summary: `Added profile ${p.name} (${p.type === 'kid' ? 'Kid' : 'Adult'})` });
  return json({ profile: p }, 201);
});

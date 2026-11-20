import { route, json } from '@/lib/route';
import { listActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';

export const GET = route('GET /api/activity', (req) => {
  const u = new URL(req.url);
  const pin = u.searchParams.get('pin');
  const before = Number(u.searchParams.get('before') ?? 0) || undefined;
  return json({ activity: listActivity({ pinType: pin === 'adult' || pin === 'guest' ? pin : undefined, before }) });
});

import { route, json } from '@/lib/route';
import { listAlerts } from '@/lib/safeguards';

export const dynamic = 'force-dynamic';

// Alerts for adults, in the app only (mockup Alerts). ?tv=<id> for one TV.
export const GET = route('GET /api/alerts', (req) => {
  const tv = Number(new URL(req.url).searchParams.get('tv'));
  return json({ alerts: listAlerts({ tvId: Number.isInteger(tv) && tv > 0 ? tv : undefined }) });
});

import { route, json } from '@/lib/route';
import { hubStatus } from '@/lib/hub';

export const dynamic = 'force-dynamic';

export const GET = route('GET /api/hub/status', () => json({ hub: hubStatus() }));

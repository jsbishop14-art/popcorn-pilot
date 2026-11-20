import { route, json } from '@/lib/route';
import { listRequests } from '@/lib/requests';
import { now } from '@/lib/clock';

export const dynamic = 'force-dynamic';

// Waiting requests from the kid screens, and those answered today (mockup Requests).
export const GET = route('GET /api/requests', () => json(listRequests(now())));

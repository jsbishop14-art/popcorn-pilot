// Auth for server components (pages): the same hub-side check the API routes use.
import { headers } from 'next/headers';
import { authFromHeaders, type Auth } from './auth';

export function pageAuth(): Auth {
  const h = headers();
  return authFromHeaders({ cookie: h.get('cookie'), authorization: null, userAgent: h.get('user-agent') });
}

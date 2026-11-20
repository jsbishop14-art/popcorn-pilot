import { redirect } from 'next/navigation';
import { isSetUp } from '@/lib/auth';
import { pageAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default function Root() {
  if (!isSetUp()) redirect('/setup');
  const auth = pageAuth();
  redirect(auth.role === 'adult' || auth.role === 'guest' ? '/home' : '/pin');
}

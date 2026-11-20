import { redirect } from 'next/navigation';
import Shell from '@/components/Shell';
import { lockMinutes } from '@/lib/auth';
import { pageAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = pageAuth();
  if (auth.role !== 'adult' && auth.role !== 'guest') redirect(auth.idleLocked ? '/pin?idle=1' : '/pin');
  return (
    <Shell role={auth.role} lockMinutes={lockMinutes()}>
      {children}
    </Shell>
  );
}

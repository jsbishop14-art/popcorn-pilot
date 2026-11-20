import { PageTop } from '@/components/Page';
import Dashboard from '@/components/Dashboard';
import { allTvViews } from '@/lib/playback';
import { pageAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const auth = pageAuth();
  return (
    <>
      <PageTop title="Home" />
      <main className="main">
        <Dashboard initial={allTvViews()} isAdult={auth.role === 'adult'} />
      </main>
    </>
  );
}

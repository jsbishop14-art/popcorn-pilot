import { ComingLater, PageTop } from '@/components/Page';
import TvStatusList from '@/components/TvStatusList';
import { guestView, listTvs } from '@/lib/tvs';
import { pageAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const auth = pageAuth();
  const tvs = listTvs().map(guestView);
  return (
    <>
      <PageTop title="Home" />
      <main className="main">
        <TvStatusList initial={tvs} isAdult={auth.role === 'adult'} />
        <ComingLater what="The dashboard (requests, what each TV is playing, time left)" build="PP3 and PP4" />
      </main>
    </>
  );
}

import { PageTop } from '@/components/Page';
import QueueScreen from '@/components/QueueScreen';
import { allTvViews } from '@/lib/playback';
import { pageAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default function QueuePage({ params }: { params: { id: string } }) {
  const auth = pageAuth();
  return (
    <>
      <PageTop title="Live queue" back="/home" />
      <QueueScreen tvId={Number(params.id)} isAdult={auth.role === 'adult'} initial={allTvViews()} />
    </>
  );
}

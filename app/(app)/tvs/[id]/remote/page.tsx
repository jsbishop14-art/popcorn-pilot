import { PageTop } from '@/components/Page';
import RemoteScreen from '@/components/RemoteScreen';
import { allTvViews } from '@/lib/playback';
import { getTv } from '@/lib/tvs';

export const dynamic = 'force-dynamic';

export default function RemotePage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const tv = Number.isInteger(id) && id > 0 ? getTv(id) : null;
  return (
    <>
      <PageTop title={tv?.name ?? 'Remote'} back="/home" />
      <RemoteScreen tvId={id} initial={allTvViews()} />
    </>
  );
}

import { notFound } from 'next/navigation';
import { AdultOnly, PageTop } from '@/components/Page';
import TvEditor from '@/components/TvEditor';
import { getTv } from '@/lib/tvs';
import { listProfiles } from '@/lib/profiles';
import { pageAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default function TvPage({ params }: { params: { id: string } }) {
  if (pageAuth().role !== 'adult') return <AdultOnly />;
  const tv = getTv(Number(params.id));
  if (!tv) notFound();
  return (
    <>
      <PageTop title={tv.name} back="/settings" />
      <TvEditor tv={tv} profiles={listProfiles().map((p) => ({ id: p.id, name: p.name, type: p.type }))} />
    </>
  );
}

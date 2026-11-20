// Settings > Calm titles (mockup Settings, "Calm titles · N tagged").
import CalmList from '@/components/CalmList';
import { AdultOnly, PageTop } from '@/components/Page';
import { taggedTitles } from '@/lib/catalog';
import { pageAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default function CalmPage() {
  if (pageAuth().role !== 'adult') return <AdultOnly />;
  return (
    <>
      <PageTop title="Calm titles" back="/settings" />
      <CalmList initial={taggedTitles('calm')} />
    </>
  );
}

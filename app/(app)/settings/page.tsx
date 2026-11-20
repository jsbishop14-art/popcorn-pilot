import { AdultOnly, PageTop } from '@/components/Page';
import SettingsScreen from '@/components/SettingsScreen';
import { listTvs } from '@/lib/tvs';
import { pageAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  if (pageAuth().role !== 'adult') return <AdultOnly />;
  return (
    <>
      <PageTop title="Settings" />
      <SettingsScreen initialTvs={listTvs()} />
    </>
  );
}

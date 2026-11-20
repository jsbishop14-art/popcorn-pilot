import { PageTop } from '@/components/Page';
import QuickScreen from '@/components/QuickScreen';
import { pickerProfiles, startProfile } from '@/lib/browse-profiles';
import { guestView, listTvs } from '@/lib/tvs';
import { pageAuth } from '@/lib/server-auth';
import { profileQuery } from '@/lib/catalog/types';

export const dynamic = 'force-dynamic';

export default function QuickPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const auth = pageAuth();
  const role = auth.role === 'adult' ? 'adult' : 'guest';
  const profile = startProfile(role, pickerProfiles(role), searchParams.profile);
  return (
    <>
      <PageTop title="Quick playlist" back={`/playlists${profileQuery(profile)}`} />
      <QuickScreen role={role} profile={profile} tvs={listTvs().map(guestView)} />
    </>
  );
}

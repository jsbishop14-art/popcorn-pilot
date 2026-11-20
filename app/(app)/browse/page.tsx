// Browse (mockups Browse and PhoneBrowse).
import BrowseScreen from '@/components/BrowseScreen';
import { PageTop } from '@/components/Page';
import { pickerProfiles, startProfile } from '@/lib/browse-profiles';
import { pageAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default function BrowsePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const role = pageAuth().role === 'adult' ? 'adult' : 'guest';
  const profiles = pickerProfiles(role);
  return (
    <>
      <PageTop title="Browse" />
      <BrowseScreen role={role} profiles={profiles} initialProfile={startProfile(role, profiles, searchParams.profile)} />
    </>
  );
}

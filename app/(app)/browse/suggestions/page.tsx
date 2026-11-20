// Suggestions (mockup Suggestions). Reached from Browse and from Playlists.
import SuggestionsScreen from '@/components/SuggestionsScreen';
import { PageTop } from '@/components/Page';
import { pickerProfiles, startProfile } from '@/lib/browse-profiles';
import { profileQuery } from '@/lib/catalog/types';
import { pageAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default function SuggestionsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const role = pageAuth().role === 'adult' ? 'adult' : 'guest';
  const profiles = pickerProfiles(role);
  const start = startProfile(role, profiles, searchParams.profile);
  return (
    <>
      <PageTop title="Suggestions" back={`/browse${profileQuery(start)}`} />
      <SuggestionsScreen role={role} profiles={profiles} initialProfile={start} />
    </>
  );
}

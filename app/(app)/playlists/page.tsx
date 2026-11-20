import { PageTop } from '@/components/Page';
import PlaylistsScreen from '@/components/PlaylistsScreen';
import { viewerFor } from '@/lib/catalog';
import { listPlaylists } from '@/lib/playlists';
import { pickerProfiles, startProfile } from '@/lib/browse-profiles';
import { pageAuth } from '@/lib/server-auth';
import { listRoutines } from '@/lib/routines';

export const dynamic = 'force-dynamic';

export default function PlaylistsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const auth = pageAuth();
  const role = auth.role === 'adult' ? 'adult' : 'guest';
  const profiles = pickerProfiles(role);
  const profile = startProfile(role, profiles, searchParams.profile);
  // The Guest PIN with no kid profile yet sees no playlists (nothing to show for).
  const list = role === 'guest' && profile === null ? [] : listPlaylists(viewerFor(auth, profile));
  return (
    <>
      <PageTop title="Playlists" />
      <PlaylistsScreen role={role} initial={list} profiles={profiles} profile={profile} routineCount={role === 'adult' ? listRoutines().length : undefined} />
    </>
  );
}

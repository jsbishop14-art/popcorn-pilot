import { PageTop } from '@/components/Page';
import PlaylistScreen from '@/components/PlaylistScreen';
import { viewerFor } from '@/lib/catalog';
import { getPlaylist } from '@/lib/playlists';
import { pickerProfiles, startProfile } from '@/lib/browse-profiles';
import { guestView, listTvs } from '@/lib/tvs';
import { pageAuth } from '@/lib/server-auth';
import { profileQuery } from '@/lib/catalog/types';

export const dynamic = 'force-dynamic';

export default function PlaylistPage({ params, searchParams }: { params: { id: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const auth = pageAuth();
  const role = auth.role === 'adult' ? 'adult' : 'guest';
  const profiles = pickerProfiles(role);
  const profile = startProfile(role, profiles, searchParams.profile);
  const id = Number(params.id);
  const p = Number.isInteger(id) && id > 0 && !(role === 'guest' && profile === null) ? getPlaylist(id, viewerFor(auth, profile)) : null;
  const back = `/playlists${profileQuery(profile)}`;
  if (!p || p.quick) {
    return (
      <>
        <PageTop title="Playlist" back={back} />
        <main className="main">
          <div className="note" role="alert">
            <span className="t">No such playlist.</span>
          </div>
        </main>
      </>
    );
  }
  return (
    <>
      <PageTop title={p.name} back={back} />
      <PlaylistScreen role={role} playlist={p} tvs={listTvs().map(guestView)} profiles={profiles} profile={profile} />
    </>
  );
}

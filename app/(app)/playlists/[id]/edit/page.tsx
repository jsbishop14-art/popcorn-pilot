import { PageTop } from '@/components/Page';
import PlaylistEditor from '@/components/PlaylistEditor';
import { EVERYONE } from '@/lib/catalog';
import { getPlaylist } from '@/lib/playlists';
import { pickerProfiles } from '@/lib/browse-profiles';
import { guestView, listTvs } from '@/lib/tvs';

export const dynamic = 'force-dynamic';

export default function EditPlaylistPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const p = Number.isInteger(id) && id > 0 ? getPlaylist(id, EVERYONE) : null;
  if (!p || p.quick) {
    return (
      <>
        <PageTop title="Edit playlist" back="/playlists" />
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
      <PageTop title="Edit playlist" back={`/playlists/${p.id}`} />
      <PlaylistEditor playlist={p} tvs={listTvs().map(guestView)} profiles={pickerProfiles('adult')} />
    </>
  );
}

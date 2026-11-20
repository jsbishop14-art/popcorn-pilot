import { PageTop } from '@/components/Page';
import NewPlaylist from '@/components/NewPlaylist';

export default function NewPlaylistPage() {
  return (
    <>
      <PageTop title="New playlist" back="/playlists" />
      <NewPlaylist />
    </>
  );
}

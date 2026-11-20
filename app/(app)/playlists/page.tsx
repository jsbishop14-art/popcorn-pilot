import { ComingLater, PageTop } from '@/components/Page';

export default function PlaylistsPage() {
  return (
    <>
      <PageTop title="Playlists" />
      <main className="main">
        <ComingLater what="Playlists and playback" build="PP3" />
      </main>
    </>
  );
}

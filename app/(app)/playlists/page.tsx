import Link from 'next/link';
import { ComingLater, PageTop } from '@/components/Page';
import { SparkIcon } from '@/components/icons';

export default function PlaylistsPage() {
  return (
    <>
      <PageTop title="Playlists" />
      <main className="main">
        <ComingLater what="Playlists and playback" build="PP3" />
        <Link href="/browse/suggestions" className="btn wide">
          <SparkIcon size={20} /> Suggestions
        </Link>
      </main>
    </>
  );
}

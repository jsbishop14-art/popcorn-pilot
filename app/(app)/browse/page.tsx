import { ComingLater, PageTop } from '@/components/Page';

export default function BrowsePage() {
  return (
    <>
      <PageTop title="Browse" />
      <main className="main">
        <ComingLater what="Browse (Netflix, Prime Video and Hulu titles with cover art)" build="PP2" />
      </main>
    </>
  );
}

import { AdultOnly, PageTop } from '@/components/Page';
import RoutineEditor from '@/components/RoutineEditor';
import { editorChoices } from '@/lib/routines';
import { pageAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default function NewRoutinePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  if (pageAuth().role !== 'adult') return <AdultOnly />;
  const choices = editorChoices();
  const n = Number(searchParams.tv);
  const tvId = choices.tvs.some((t) => t.id === n) ? n : null;
  return (
    <>
      <PageTop title="New routine" back="/playlists/routines" />
      <RoutineEditor routine={null} choices={choices} tvId={tvId} />
    </>
  );
}

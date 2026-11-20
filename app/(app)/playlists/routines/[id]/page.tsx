import { AdultOnly, PageTop } from '@/components/Page';
import RoutineEditor from '@/components/RoutineEditor';
import { editorChoices, getRoutine } from '@/lib/routines';
import { pageAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default function EditRoutinePage({ params }: { params: { id: string } }) {
  if (pageAuth().role !== 'adult') return <AdultOnly />;
  const id = Number(params.id);
  const r = Number.isInteger(id) && id > 0 ? getRoutine(id) : null;
  if (!r) {
    return (
      <>
        <PageTop title="Edit routine" back="/playlists/routines" />
        <main className="main">
          <div className="note" role="alert">
            <span className="t">No such routine.</span>
          </div>
        </main>
      </>
    );
  }
  return (
    <>
      <PageTop title="Edit routine" back="/playlists/routines" />
      <RoutineEditor routine={r} choices={editorChoices()} tvId={r.tvId} />
    </>
  );
}

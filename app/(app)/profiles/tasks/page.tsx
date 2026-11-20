import { AdultOnly, PageTop } from '@/components/Page';
import TasksScreen from '@/components/TasksScreen';
import { kidTasks, listTasks } from '@/lib/requests';
import { kidSummaries } from '@/lib/kid-views';
import { PICTURES } from '@/lib/safeguards';
import { pageAuth } from '@/lib/server-auth';
import { now } from '@/lib/clock';

export const dynamic = 'force-dynamic';

export default function TasksPage() {
  if (pageAuth().role !== 'adult') return <AdultOnly />;
  const at = now();
  const pictures = Object.fromEntries(Object.entries(PICTURES).map(([k, v]) => [k, { label: v.label, emoji: v.emoji }]));
  return (
    <>
      <PageTop title="Earn time tasks" back="/profiles" />
      <TasksScreen initial={{ tasks: listTasks(), kids: kidSummaries(at).map((k) => kidTasks(k.id, at)), pictures }} />
    </>
  );
}

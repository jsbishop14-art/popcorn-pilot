import { route, json, body } from '@/lib/route';
import { cleanDefinition, runDefinition } from '@/lib/routines';

export const dynamic = 'force-dynamic';

// Test now (mockup RoutineEditor): run the steps as they are in the editor, saved or not. Every step runs except the
// timer, which says when it would turn the TV off. Body: the routine as in the editor, plus id when it is saved.
export const POST = route('POST /api/routines/test', async (req, auth) => {
  const b = await body(req);
  const def = cleanDefinition(b);
  const id = Number(b.id);
  const result = await runDefinition(def, { routineId: Number.isInteger(id) && id > 0 ? id : null, by: 'adult', device: auth.device, test: true });
  return json({ result });
});

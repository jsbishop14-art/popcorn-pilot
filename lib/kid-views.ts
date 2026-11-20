// Data for the kid tool screens in the app (Profiles, Requests, Alerts, Tasks, Watch log): the list of kid profiles
// with their time today, and a kid's block list with title names.
import { getDb } from './db';
import { taggedTitles, titleForTag } from './catalog';
import { kidRules, timeStatus, type KidRules, type TimeStatus } from './safeguards';

export interface KidSummary {
  id: number;
  name: string;
  color: string;
  initial: string;
  time: TimeStatus;
}

export function kidSummaries(at: number): KidSummary[] {
  const rows = getDb().prepare("SELECT id, name, color, initial FROM profiles WHERE deleted_at IS NULL AND type = 'kid' ORDER BY name COLLATE NOCASE, id").all() as Omit<KidSummary, 'time'>[];
  return rows.map((p) => ({ ...p, time: timeStatus(kidRules(p.id) as KidRules, at) }));
}

export interface BlockedTitle {
  key: string;
  name: string;
  rating: string | null;
  /** Blocked for every kid (Browse "Block for kids"), not only on this kid's own list. */
  everyKid: boolean;
}

/** A kid's block list with names: this kid's own list, then titles blocked for every kid. */
export async function blockedList(r: KidRules): Promise<BlockedTitle[]> {
  const own: BlockedTitle[] = [];
  for (const key of r.blockedTitles) {
    try {
      const t = await titleForTag(key);
      own.push({ key, name: t.name, rating: t.rating, everyKid: false });
    } catch {
      own.push({ key, name: key, rating: null, everyKid: false });
    }
  }
  const all = taggedTitles('blocked')
    .filter((t) => !r.blockedTitles.includes(t.key))
    .map((t) => ({ key: t.key, name: t.name, rating: t.rating, everyKid: true }));
  return [...own, ...all];
}

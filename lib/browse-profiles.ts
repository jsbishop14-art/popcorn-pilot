// Which profiles the "Showing for" picker offers: every profile with the Adult PIN, kid profiles only with the Guest
// PIN (Guest is kid mode and playlists). The hub refuses the rest anyway (lib/catalog viewerFor).
import { listProfiles } from './profiles';

export interface PickerProfile {
  id: number;
  name: string;
  type: 'adult' | 'kid';
}

export function pickerProfiles(role: 'adult' | 'guest'): PickerProfile[] {
  return listProfiles()
    .filter((p) => role === 'adult' || p.type === 'kid')
    .map((p) => ({ id: p.id, name: p.name, type: p.type }));
}

/** The profile to start with: the one asked for if offered, else none (Adult) or the first kid (Guest). */
export function startProfile(role: 'adult' | 'guest', offered: PickerProfile[], asked: string | string[] | undefined): number | null {
  const n = Number(Array.isArray(asked) ? asked[0] : asked);
  if (Number.isInteger(n) && offered.some((p) => p.id === n)) return n;
  return role === 'adult' ? null : (offered[0]?.id ?? null);
}

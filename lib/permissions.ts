// The permission map: every API route and every page, with the answer for every role (CLAUDE.md section 7).
// Typed by the role list, so adding a role or a route without an answer for each role fails the type-check.
// Pure data: imported by the middleware (edge), the route wrapper and the permission tests.

export const ROLES = ['adult', 'guest', 'signed_out', 'channel'] as const;
export type Role = (typeof ROLES)[number];
export type Rule = Readonly<Record<Role, boolean>>;

const ADULT: Rule = { adult: true, guest: false, signed_out: false, channel: false };
const PEOPLE: Rule = { adult: true, guest: true, signed_out: false, channel: false };
const PUBLIC: Rule = { adult: true, guest: true, signed_out: true, channel: true };
const SIGNED_OUT: Rule = { adult: false, guest: false, signed_out: true, channel: false };
const CHANNEL: Rule = { adult: false, guest: false, signed_out: false, channel: true };

/** Every API route, as "METHOD /api/path" with [param] segments. */
export const API_RULES = {
  'GET /api/auth/state': PUBLIC,
  'POST /api/auth/setup': SIGNED_OUT,
  'POST /api/auth/pin': { adult: true, guest: true, signed_out: true, channel: false },
  'POST /api/auth/lock': PEOPLE,

  'GET /api/profiles': ADULT,
  'POST /api/profiles': ADULT,
  'GET /api/profiles/[id]': ADULT,
  'PATCH /api/profiles/[id]': ADULT,
  'DELETE /api/profiles/[id]': ADULT,

  'GET /api/tvs': PEOPLE,
  'POST /api/tvs': ADULT,
  'POST /api/tvs/refresh': PEOPLE,
  'POST /api/tvs/discover': ADULT,
  'GET /api/tvs/[id]': ADULT,
  'PATCH /api/tvs/[id]': ADULT,
  'DELETE /api/tvs/[id]': ADULT,
  'POST /api/tvs/[id]/channel-token': ADULT,

  'GET /api/settings': ADULT,
  'PATCH /api/settings': ADULT,
  'POST /api/settings/pins': ADULT,

  'GET /api/activity': ADULT,

  'GET /api/hub/status': ADULT,
  'POST /api/hub/update': ADULT,

  'GET /api/channel/hello': CHANNEL,

  // Catalog (PP2). Browsing, details, trailers and playing are for both PINs (the Guest PIN only for a kid profile,
  // checked in the handler); tags are kid safeguards, so Adult only.
  'GET /api/catalog/browse': PEOPLE,
  'GET /api/catalog/suggestions': PEOPLE,
  'GET /api/catalog/art/[id]': PEOPLE,
  'GET /api/catalog/titles/[id]': PEOPLE,
  'GET /api/catalog/titles/[id]/similar': PEOPLE,
  'POST /api/catalog/titles/[id]/play': PEOPLE,
  'POST /api/catalog/titles/[id]/trailer': PEOPLE,
  'POST /api/catalog/titles/[id]/calm': ADULT,
  'POST /api/catalog/titles/[id]/block': ADULT,
  'GET /api/catalog/calm': ADULT,

  // Playlists and playback (PP3). Guest is "kid mode and playlists": it sees and starts playlists for a kid profile
  // (checked in the handler), uses the quick playlist, and pauses, resumes, skips or stops what a TV plays. Making,
  // editing, saving and deleting playlists, editing a live queue, Send to and the remote are Adult only.
  'GET /api/playlists': PEOPLE,
  'POST /api/playlists': ADULT,
  'GET /api/playlists/[id]': PEOPLE,
  'PATCH /api/playlists/[id]': ADULT,
  'DELETE /api/playlists/[id]': ADULT,
  'POST /api/playlists/[id]/items': ADULT,
  'POST /api/playlists/[id]/start': PEOPLE,
  'GET /api/quick': PEOPLE,
  'DELETE /api/quick': PEOPLE,
  'POST /api/quick/items': PEOPLE,
  'POST /api/quick/start': PEOPLE,
  'POST /api/quick/save': ADULT,
  'GET /api/playback': PEOPLE,
  'POST /api/tvs/[id]/playback': PEOPLE,
  'POST /api/tvs/[id]/queue': ADULT,
  'POST /api/tvs/[id]/send': ADULT,
  'POST /api/tvs/[id]/remote': ADULT,

  // The Roku channel (PP6) for its own TV: home screen data, and now playing with up next.
  'GET /api/channel/home': CHANNEL,
  'GET /api/channel/now-playing': CHANNEL,

  // Kid safeguards (PP4). Safeguards, requests and approvals, alerts, tasks and the watch log are Adult only (the
  // Guest PIN has none of them). Switching a TV to a profile is for both PINs: the Guest PIN to a kid profile only
  // (checked in the handler), so it can never take a TV out of kid mode.
  'GET /api/profiles/[id]/safeguards': ADULT,
  'PATCH /api/profiles/[id]/safeguards': ADULT,
  'GET /api/profiles/[id]/watch-log': ADULT,
  'GET /api/requests': ADULT,
  'POST /api/requests/[id]': ADULT,
  'GET /api/alerts': ADULT,
  'GET /api/tasks': ADULT,
  'POST /api/tasks': ADULT,
  'PATCH /api/tasks/[id]': ADULT,
  'DELETE /api/tasks/[id]': ADULT,
  'POST /api/tasks/[id]/done': ADULT,
  'POST /api/tvs/[id]/profile': PEOPLE,
  // The channel's kid screens: time left, tasks and the bonus, asking (more time, a title, a task done), and an
  // adult approving on the TV with the Adult PIN (checked in the handler, with the PIN lockout).
  'GET /api/channel/kid': CHANNEL,
  'POST /api/channel/requests': CHANNEL,
  'POST /api/channel/requests/[id]': CHANNEL,
} as const satisfies Record<string, Rule>;

export type ApiRoute = keyof typeof API_RULES;

/** Every page. Signed-out visitors to a page they cannot open are sent to PIN entry; others get 403. */
export const PAGE_RULES = {
  '/': PUBLIC,
  '/pin': PUBLIC,
  '/setup': PUBLIC,
  '/home': PEOPLE,
  '/browse': PEOPLE,
  '/browse/suggestions': PEOPLE,
  '/browse/[id]': PEOPLE,
  '/playlists': PEOPLE,
  '/playlists/new': ADULT,
  '/playlists/quick': PEOPLE,
  '/playlists/[id]': PEOPLE,
  '/playlists/[id]/edit': ADULT,
  '/tvs/[id]/queue': PEOPLE,
  '/tvs/[id]/remote': ADULT,
  '/profiles': ADULT,
  '/profiles/new': ADULT,
  '/profiles/[id]': ADULT,
  '/profiles/requests': ADULT,
  '/profiles/alerts': ADULT,
  '/profiles/tasks': ADULT,
  '/profiles/watch-log': ADULT,
  '/settings': ADULT,
  '/settings/tvs/[id]': ADULT,
  '/settings/activity': ADULT,
  '/settings/calm': ADULT,
} as const satisfies Record<string, Rule>;

export type PagePattern = keyof typeof PAGE_RULES;

function matches(pattern: string, path: string): boolean {
  const a = pattern.split('/');
  const b = path.split('/');
  if (a.length !== b.length) return false;
  return a.every((seg, i) => (seg.startsWith('[') ? b[i].length > 0 : seg === b[i]));
}

/** The rule for a concrete page path, or null for a path that is not a page (falls through to 404). */
export function pageRule(path: string): Rule | null {
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
  const exact = (PAGE_RULES as Record<string, Rule>)[clean];
  if (exact) return exact;
  for (const [pattern, rule] of Object.entries(PAGE_RULES)) if (matches(pattern, clean)) return rule;
  return null;
}

export function allowed(rule: Rule, role: Role): boolean {
  return rule[role];
}

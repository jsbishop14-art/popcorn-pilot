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
} as const satisfies Record<string, Rule>;

export type ApiRoute = keyof typeof API_RULES;

/** Every page. Signed-out visitors to a page they cannot open are sent to PIN entry; others get 403. */
export const PAGE_RULES = {
  '/': PUBLIC,
  '/pin': PUBLIC,
  '/setup': PUBLIC,
  '/home': PEOPLE,
  '/browse': PEOPLE,
  '/playlists': PEOPLE,
  '/profiles': ADULT,
  '/profiles/new': ADULT,
  '/profiles/[id]': ADULT,
  '/settings': ADULT,
  '/settings/tvs/[id]': ADULT,
  '/settings/activity': ADULT,
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

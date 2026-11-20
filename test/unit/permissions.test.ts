// Check 2: the permission map for every API route and every role (Adult PIN, Guest PIN, signed out, channel token),
// deny and allow. The expected answers come from CLAUDE.md section 7, written out here per route, not read from
// lib/permissions.ts, so a wrong entry in the map fails this test.
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { freshDataDir, resetLockout, UA } from './helpers';
import { API_RULES, PAGE_RULES, ROLES, pageRule, type Role } from '@/lib/permissions';
import { setUpPins, signInWithPin, SESSION_COOKIE } from '@/lib/auth';
import { createProfile } from '@/lib/profiles';
import { getDb } from '@/lib/db';
import { newChannelToken } from '@/lib/tvs';

type Answer = Record<Role, 'allow' | 'deny'>;
const A = (adult: boolean, guest: boolean, signed_out: boolean, channel: boolean): Answer => ({
  adult: adult ? 'allow' : 'deny',
  guest: guest ? 'allow' : 'deny',
  signed_out: signed_out ? 'allow' : 'deny',
  channel: channel ? 'allow' : 'deny',
});
const ADULT_ONLY = A(true, false, false, false);
const PEOPLE = A(true, true, false, false);

// Written by hand from the roles table. Guest: kid mode and playlists (and seeing which TVs exist), nothing in
// settings, profiles, safeguards, PINs, approvals or activity history.
const EXPECTED: Record<string, Answer> = {
  'GET /api/auth/state': A(true, true, true, true),
  'POST /api/auth/setup': A(false, false, true, false),
  'POST /api/auth/pin': A(true, true, true, false),
  'POST /api/auth/lock': PEOPLE,
  'GET /api/profiles': ADULT_ONLY,
  'POST /api/profiles': ADULT_ONLY,
  'GET /api/profiles/[id]': ADULT_ONLY,
  'PATCH /api/profiles/[id]': ADULT_ONLY,
  'DELETE /api/profiles/[id]': ADULT_ONLY,
  'GET /api/tvs': PEOPLE,
  'POST /api/tvs': ADULT_ONLY,
  'POST /api/tvs/refresh': PEOPLE,
  'POST /api/tvs/discover': ADULT_ONLY,
  'GET /api/tvs/[id]': ADULT_ONLY,
  'PATCH /api/tvs/[id]': ADULT_ONLY,
  'DELETE /api/tvs/[id]': ADULT_ONLY,
  'POST /api/tvs/[id]/channel-token': ADULT_ONLY,
  'GET /api/settings': ADULT_ONLY,
  'PATCH /api/settings': ADULT_ONLY,
  'POST /api/settings/pins': ADULT_ONLY,
  'GET /api/activity': ADULT_ONLY,
  'GET /api/hub/status': ADULT_ONLY,
  'POST /api/hub/update': ADULT_ONLY,
  'GET /api/channel/hello': A(false, false, false, true),
};

const EXPECTED_PAGES: Record<string, Answer> = {
  '/': A(true, true, true, true),
  '/pin': A(true, true, true, true),
  '/setup': A(true, true, true, true),
  '/home': PEOPLE,
  '/browse': PEOPLE,
  '/playlists': PEOPLE,
  '/profiles': ADULT_ONLY,
  '/profiles/new': ADULT_ONLY,
  '/profiles/[id]': ADULT_ONLY,
  '/settings': ADULT_ONLY,
  '/settings/tvs/[id]': ADULT_ONLY,
  '/settings/activity': ADULT_ONLY,
};

const API_DIR = path.join(process.cwd(), 'app/api');

/** Every route the app actually serves: each route.ts and the methods it exports. */
function discoveredRoutes(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'route.ts') {
        const src = fs.readFileSync(p, 'utf8');
        const urlPath = '/api/' + path.relative(API_DIR, path.dirname(p)).split(path.sep).join('/');
        for (const m of src.matchAll(/^export const (GET|POST|PUT|PATCH|DELETE)\b/gm)) out.push(`${m[1]} ${urlPath}`);
      }
    }
  };
  walk(API_DIR);
  return out.sort();
}

function modulePath(key: string): string {
  const urlPath = key.split(' ')[1];
  return path.join(process.cwd(), 'app', urlPath, 'route.ts');
}

let ids: { profile: number; tv: number };

async function headersFor(role: Role): Promise<Record<string, string>> {
  const h: Record<string, string> = { 'user-agent': UA.computer, 'content-type': 'application/json' };
  if (role === 'adult' || role === 'guest') {
    resetLockout();
    const r = await signInWithPin(role === 'adult' ? '1357' : '2468', 'Computer');
    if (r.status !== 'ok') throw new Error(`sign in failed: ${r.status}`);
    h.cookie = `${SESSION_COOKIE}=${encodeURIComponent(r.token)}`;
  }
  // A fresh token each time: the adult call to the channel-token route replaces the old one.
  if (role === 'channel') h.authorization = `Bearer ${newChannelToken(ids.tv)}`;
  return h;
}

async function call(key: string, role: Role): Promise<Response> {
  const [method, urlPath] = key.split(' ');
  const mod = (await import(modulePath(key))) as Record<string, (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>>;
  const handler = mod[method];
  if (!handler) throw new Error(`${key}: no ${method} export`);
  const id = method === 'DELETE' ? '999' : urlPath.includes('profiles') ? String(ids.profile) : String(ids.tv);
  const url = 'http://hub.test' + urlPath.replace('[id]', id);
  const init: RequestInit = { method, headers: await headersFor(role) };
  if (method !== 'GET') init.body = '{}';
  return handler(new Request(url, init), { params: { id } });
}

beforeAll(async () => {
  freshDataDir();
  process.env.PP_SSDP_TARGET = '127.0.0.1:9';
  const s = await setUpPins('1357', '2468', 'Computer');
  expect(s.status).toBe('ok');
  const p = createProfile({ name: 'Kid placeholder', color: '#7FC8A9', type: 'kid' });
  const tv = getDb().prepare("INSERT INTO tvs (name, address, port) VALUES ('Fake TV', '127.0.0.1', 1)").run();
  ids = { profile: p.id, tv: Number(tv.lastInsertRowid) };
});

describe('permission map (check 2)', () => {
  it('covers exactly the routes the app serves', () => {
    expect(Object.keys(API_RULES).sort()).toEqual(discoveredRoutes());
    expect(Object.keys(EXPECTED).sort()).toEqual(discoveredRoutes());
  });

  it('matches the roles table for every route and role', () => {
    for (const [key, rule] of Object.entries(API_RULES)) {
      for (const role of ROLES) expect(`${key} ${role} ${rule[role] ? 'allow' : 'deny'}`).toBe(`${key} ${role} ${EXPECTED[key][role]}`);
    }
  });

  it('matches the roles table for every page', () => {
    expect(Object.keys(PAGE_RULES).sort()).toEqual(Object.keys(EXPECTED_PAGES).sort());
    for (const [page, rule] of Object.entries(PAGE_RULES)) {
      for (const role of ROLES) expect(`${page} ${role} ${rule[role] ? 'allow' : 'deny'}`).toBe(`${page} ${role} ${EXPECTED_PAGES[page][role]}`);
    }
    expect(pageRule('/profiles/12')).toBe(PAGE_RULES['/profiles/[id]']);
    expect(pageRule('/settings/tvs/3/')).toBe(PAGE_RULES['/settings/tvs/[id]']);
    expect(pageRule('/nope')).toBeNull();
  });

  const results: string[] = [];
  for (const key of Object.keys(EXPECTED)) {
    for (const role of ROLES) {
      it(`${key} as ${role}: ${EXPECTED[key][role]}`, async () => {
        const res = await call(key, role);
        const denied = res.headers.get('x-pp-denied') !== null;
        results.push(`${key} ${role} ${res.status}`);
        if (EXPECTED[key][role] === 'deny') {
          expect(denied).toBe(true);
          expect(res.status).toBe(role === 'signed_out' ? 401 : 403);
        } else {
          expect(denied).toBe(false);
        }
      });
    }
  }

  it('a wrong channel token counts as signed out (control)', async () => {
    const mod = await import(modulePath('GET /api/channel/hello'));
    const res: Response = await mod.GET(new Request('http://hub.test/api/channel/hello', { headers: { authorization: 'Bearer wrong' } }), { params: {} });
    expect(res.status).toBe(401);
    expect(res.headers.get('x-pp-denied')).toBe('signed_out');
  });

  it('the channel token answers only for its own TV', async () => {
    const mod = await import(modulePath('GET /api/channel/hello'));
    const res: Response = await mod.GET(new Request('http://hub.test/api/channel/hello', { headers: await headersFor('channel') }), { params: {} });
    expect(res.status).toBe(200);
    const b = (await res.json()) as { tv: { id: number }; profiles: unknown[] };
    expect(b.tv.id).toBe(ids.tv);
    expect(b.profiles).toHaveLength(1);
  });
});

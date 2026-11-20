// Check 2 over real HTTP against the production build: every API route and every page, for the Adult PIN, the
// Guest PIN, signed out and a channel token. The unit test (test/unit/permissions.test.ts) checks the same map
// against a hand-written table; this one checks the running server applies it.
import { expect, request as pwRequest, test, type APIRequestContext } from '@playwright/test';
import { API_RULES, PAGE_RULES, ROLES, type Role } from '../../lib/permissions';
import { ADULT, GUEST } from './helpers';

const BASE = 'http://127.0.0.1:3100';

async function contextFor(role: Role, channelToken: string): Promise<APIRequestContext> {
  const ctx = await pwRequest.newContext({
    baseURL: BASE,
    extraHTTPHeaders: role === 'channel' ? { authorization: `Bearer ${channelToken}` } : {},
  });
  if (role === 'adult' || role === 'guest') {
    const r = await ctx.post('/api/auth/pin', { data: { pin: role === 'adult' ? ADULT : GUEST } });
    expect(r.status()).toBe(200);
  }
  return ctx;
}

test('every API route and page answers per the map, for every role', async () => {
  test.setTimeout(180_000);
  const admin = await contextFor('adult', '');
  const tvs = (await (await admin.get('/api/tvs')).json()).tvs as { id: number }[];
  const profiles = (await (await admin.get('/api/profiles')).json()).profiles as { id: number }[];
  expect(tvs.length).toBeGreaterThan(0);
  expect(profiles.length).toBeGreaterThan(0);
  const tvId = tvs[0].id;
  const freshToken = async () => (await (await admin.post(`/api/tvs/${tvId}/channel-token`)).json()).token as string;

  const lines: string[] = [];
  for (const [key, rule] of Object.entries(API_RULES)) {
    const [method, path] = key.split(' ');
    for (const role of ROLES) {
      // A fresh context per call: lock and PIN routes end or change sessions.
      const ctx = await contextFor(role, await freshToken());
      const id = method === 'DELETE' ? '999' : path.includes('profiles') ? String(profiles[0].id) : String(tvId);
      const url = path.replace('[id]', id);
      const data = key === 'POST /api/auth/pin' ? { pin: ADULT } : {};
      const res = await ctx.fetch(url, { method, data: method === 'GET' ? undefined : data });
      const denied = res.headers()['x-pp-denied'] !== undefined;
      const want = rule[role] ? 'allow' : 'deny';
      const got = denied ? (res.status() === (role === 'signed_out' ? 401 : 403) ? 'deny' : `deny-${res.status()}`) : 'allow';
      lines.push(`${key} ${role} ${got}`);
      expect(`${key} ${role} ${got}`).toBe(`${key} ${role} ${want}`);
      await ctx.dispose();
    }
  }

  for (const [pattern, rule] of Object.entries(PAGE_RULES)) {
    const path = pattern.replace('/profiles/[id]', `/profiles/${profiles[0].id}`).replace('/settings/tvs/[id]', `/settings/tvs/${tvId}`);
    for (const role of ROLES) {
      const ctx = await contextFor(role, await freshToken());
      const res = await ctx.get(path, { maxRedirects: 0 });
      const s = res.status();
      // Allowed pages render (200) or send the visitor on (redirect). Refused: signed out -> PIN entry, others -> 403.
      let got: string;
      if (s === 403) got = 'deny';
      else if (s >= 300 && s < 400 && !rule.signed_out && /\/(pin|setup)/.test(res.headers().location ?? '')) got = 'deny';
      else got = 'allow';
      expect(`${pattern} ${role} ${got}`).toBe(`${pattern} ${role} ${rule[role] ? 'allow' : 'deny'}`);
      lines.push(`${pattern} ${role} ${got}`);
      await ctx.dispose();
    }
  }
  console.log(`permission map over HTTP: ${lines.length} answers checked`);
  expect(lines.length).toBe((Object.keys(API_RULES).length + Object.keys(PAGE_RULES).length) * ROLES.length);
  await admin.dispose();
});

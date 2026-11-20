// Page guard: every page is checked against the permission map before it renders. Signed out -> PIN entry (or
// first run); a PIN the page is not for -> 403. The hub-side check is /api/auth/state (the middleware cannot open
// the database itself).
import { NextResponse, type NextRequest } from 'next/server';
import { pageRule, type Role } from './lib/permissions';

export async function middleware(req: NextRequest) {
  const rule = pageRule(req.nextUrl.pathname);
  if (!rule || rule.signed_out) return NextResponse.next();
  let state: { role: Role; setUp: boolean; idleLocked: boolean } = { role: 'signed_out', setUp: true, idleLocked: false };
  try {
    // Ask the hub over loopback: the name the browser used (popcorn.local) may not resolve on the Pi itself.
    const port = process.env.PORT || req.nextUrl.port || '80';
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/state`, {
      headers: { cookie: req.headers.get('cookie') ?? '', 'user-agent': req.headers.get('user-agent') ?? '' },
      cache: 'no-store',
    });
    state = await res.json();
  } catch {
    // treat as signed out
  }
  if (rule[state.role]) return NextResponse.next();
  if (state.role === 'signed_out') {
    const to = new URL(state.setUp ? '/pin' : '/setup', req.nextUrl.origin);
    if (state.idleLocked) to.searchParams.set('idle', '1');
    return NextResponse.redirect(to);
  }
  const body =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Not available</title></head>' +
    '<body style="font-family:system-ui,sans-serif;background:#F3F5F9;color:#0F1B33;padding:40px"><h1>Not available with the Guest PIN</h1>' +
    '<p>This part of Popcorn Pilot needs the Adult PIN.</p><p><a href="/home">Back to Home</a></p></body></html>';
  return new NextResponse(body, { status: 403, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export const config = {
  matcher: ['/((?!api|_next|favicon.ico).*)'],
};

// Every API route handler goes through route(): it looks the route up in the permission map and refuses before the
// handler runs. 401 for signed out (or an unknown channel token), 403 for a role the route is not for.
import { API_RULES, type ApiRoute } from './permissions';
import { authFromRequest, type Auth } from './auth';

export type Ctx = { params: Record<string, string> };
type Handler = (req: Request, auth: Auth, ctx: Ctx) => Promise<Response> | Response;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}

export function fail(status: number, message: string): Response {
  return json({ error: message }, status);
}

export function route(key: ApiRoute, handler: Handler) {
  const rule = API_RULES[key];
  return async (req: Request, ctx?: Ctx): Promise<Response> => {
    const auth = authFromRequest(req);
    if (!rule[auth.role]) {
      const denied = { 'x-pp-denied': auth.role };
      return auth.role === 'signed_out'
        ? json({ error: auth.idleLocked ? 'Locked after no use. Enter your PIN.' : 'Enter your PIN.' }, 401, denied)
        : json({ error: auth.role === 'guest' ? 'Not available with the Guest PIN.' : 'Not allowed.' }, 403, denied);
    }
    try {
      return await handler(req, auth, ctx ?? { params: {} });
    } catch (err) {
      if (err instanceof BadRequest) return fail(400, err.message);
      console.error(`${key} failed:`, err instanceof Error ? err.message : err);
      return fail(500, 'Something went wrong on the hub.');
    }
  };
}

export class BadRequest extends Error {}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = (await req.json()) as unknown;
    if (b && typeof b === 'object' && !Array.isArray(b)) return b as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new BadRequest('The request body must be a JSON object.');
}

export function idParam(ctx: Ctx): number {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id) || id < 1) throw new BadRequest('Bad id.');
  return id;
}

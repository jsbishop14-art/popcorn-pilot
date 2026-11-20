'use client';
// Calls from the app to the hub. A 401 means the app is locked: go to PIN entry.

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: Record<string, unknown>) {
    super(message);
  }
}

export async function api<T = Record<string, unknown>>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401 && res.headers.get('x-pp-denied')) {
    window.location.assign('/pin?idle=1');
    throw new ApiError('Locked', 401, body);
  }
  if (!res.ok) throw new ApiError(String(body.error ?? `Error ${res.status}`), res.status, body);
  return body as T;
}

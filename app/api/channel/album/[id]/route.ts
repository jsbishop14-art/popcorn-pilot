import fs from 'node:fs';
import { route, fail, idParam } from '@/lib/route';
import { albumFile } from '@/lib/album';

export const dynamic = 'force-dynamic';

// One photo or clip of the Family Album for the TV. Clips answer byte ranges, which the Roku video player asks for.
export const GET = route('GET /api/channel/album/[id]', (req, _auth, ctx) => {
  const f = albumFile(idParam(ctx));
  if (!f) return fail(404, 'No such photo.');
  const headers: Record<string, string> = { 'content-type': f.mime, 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=86400' };
  const range = req.headers.get('range')?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, f.bytes - Number(range[2]));
    let end = range[1] && range[2] ? Number(range[2]) : f.bytes - 1;
    end = Math.min(end, f.bytes - 1);
    start = Math.max(0, start);
    if (start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${f.bytes}` } });
    const data = Buffer.alloc(end - start + 1);
    const fd = fs.openSync(f.path, 'r');
    try {
      fs.readSync(fd, data, 0, data.length, start);
    } finally {
      fs.closeSync(fd);
    }
    return new Response(data, { status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${f.bytes}`, 'content-length': String(data.length) } });
  }
  return new Response(fs.readFileSync(f.path), { status: 200, headers: { ...headers, 'content-length': String(f.bytes) } });
});

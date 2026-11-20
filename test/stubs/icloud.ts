// The iCloud stub: answers like iCloud's shared album web service (webstream, webasseturls, the downloads), from
// the fixtures in test/fixtures/album. Stands in for iCloud in every test and CI run (no real iCloud call, ever).
// The first webstream call for an album answers 330 with the partition to use, like iCloud does.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

const FIXTURES = path.join(process.cwd(), 'test/fixtures/album');

export interface StubItem {
  guid: string;
  kind: 'photo' | 'clip';
  /** Fixture file name in test/fixtures/album. */
  file: string;
  /** The checksum of the copy the hub should keep; change it to make the item "changed". */
  checksum: string;
  caption?: string;
}

export interface ICloudStub {
  port: number;
  base: string;
  /** Albums by token. Replace a list to change an album; delete a token to make its link broken. */
  albums: Map<string, StubItem[]>;
  calls: { method: string; path: string }[];
  close(): Promise<void>;
}

/** The album the tests start from: three photos and a clip. */
export const GOOD_TOKEN = 'B0aGoodAlbum12x';
export const GOOD_LINK = `https://www.icloud.com/sharedalbum/#${GOOD_TOKEN}`;
/** A well-formed link to an album iCloud does not have. */
export const BROKEN_LINK = 'https://www.icloud.com/sharedalbum/#B0aNoSuchAlbum9';

export function firstAlbum(): StubItem[] {
  return [
    { guid: 'G-PHOTO-1', kind: 'photo', file: 'photo-1.png', checksum: 'c-photo-1', caption: 'Beach day' },
    { guid: 'G-PHOTO-2', kind: 'photo', file: 'photo-2.png', checksum: 'c-photo-2' },
    { guid: 'G-PHOTO-4', kind: 'photo', file: 'photo-4.png', checksum: 'c-photo-4' },
    { guid: 'G-CLIP-1', kind: 'clip', file: 'clip-1.mp4', checksum: 'c-clip-1', caption: 'First steps' },
  ];
}

/** The same album later: photo 2 replaced by a new version, photo 4 taken out, photo 3 added. */
export function changedAlbum(): StubItem[] {
  return [
    { guid: 'G-PHOTO-1', kind: 'photo', file: 'photo-1.png', checksum: 'c-photo-1', caption: 'Beach day' },
    { guid: 'G-PHOTO-2', kind: 'photo', file: 'photo-2-new.png', checksum: 'c-photo-2-v2' },
    { guid: 'G-PHOTO-3', kind: 'photo', file: 'photo-3.png', checksum: 'c-photo-3' },
    { guid: 'G-CLIP-1', kind: 'clip', file: 'clip-1.mp4', checksum: 'c-clip-1', caption: 'First steps' },
  ];
}

function size(file: string): number {
  return fs.statSync(path.join(FIXTURES, file)).size;
}

function derivatives(i: StubItem): Record<string, unknown> {
  if (i.kind === 'clip')
    return {
      PosterFrame: { checksum: `${i.checksum}-poster`, fileSize: '900', width: '1280', height: '720' },
      '720p': { checksum: i.checksum, fileSize: String(size(i.file)), width: '1280', height: '720' },
    };
  return {
    '342': { checksum: `${i.checksum}-thumb`, fileSize: '200', width: '342', height: '192' },
    '1536': { checksum: i.checksum, fileSize: String(size(i.file)), width: '1536', height: '864' },
    '4032': { checksum: `${i.checksum}-full`, fileSize: '9000000', width: '4032', height: '2268' },
  };
}

export async function startICloudStub(opts: { port?: number } = {}): Promise<ICloudStub> {
  const albums = new Map<string, StubItem[]>([[GOOD_TOKEN, firstAlbum()]]);
  const calls: ICloudStub['calls'] = [];
  const redirected = new Set<string>();
  let port = 0;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub');
    calls.push({ method: req.method ?? 'GET', path: url.pathname });
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      const m = url.pathname.match(/^\/([A-Za-z0-9]+)\/sharedstreams\/(webstream|webasseturls)$/);
      if (req.method === 'POST' && m) {
        const [, token, what] = m;
        const items = albums.get(token);
        if (!items) return send(404, {});
        if (what === 'webstream') {
          if (!redirected.has(token)) {
            redirected.add(token);
            return send(330, { 'X-Apple-MMe-Host': `127.0.0.1:${port}` });
          }
          return send(200, {
            streamName: 'Family',
            streamCtag: `ctag-${items.map((i) => i.checksum).join('.')}`,
            photos: items.map((i, n) => ({
              photoGuid: i.guid,
              batchGuid: 'batch-1',
              dateCreated: `2026-11-0${(n % 9) + 1}T12:00:00Z`,
              caption: i.caption ?? '',
              ...(i.kind === 'clip' ? { mediaAssetType: 'video' } : {}),
              derivatives: derivatives(i),
            })),
          });
        }
        let guids: string[] = [];
        try {
          guids = (JSON.parse(raw) as { photoGuids: string[] }).photoGuids;
        } catch {
          return send(400, {});
        }
        const out: Record<string, unknown> = {};
        for (const i of items.filter((x) => guids.includes(x.guid)))
          for (const d of Object.values(derivatives(i)) as { checksum: string }[])
            out[d.checksum] = { url_expiry: '2026-12-01T00:00:00Z', url_location: 'loc1', url_path: `/asset/${encodeURIComponent(d.checksum === i.checksum ? i.file : 'missing')}?c=${encodeURIComponent(d.checksum)}` };
        return send(200, { items: out, locations: { loc1: { scheme: 'http', hosts: [`127.0.0.1:${port}`] } } });
      }
      const a = url.pathname.match(/^\/asset\/([A-Za-z0-9.-]+)$/);
      if (req.method === 'GET' && a && fs.existsSync(path.join(FIXTURES, a[1]))) {
        res.writeHead(200, { 'content-type': a[1].endsWith('.mp4') ? 'video/mp4' : 'image/png' });
        res.end(fs.readFileSync(path.join(FIXTURES, a[1])));
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
  return {
    port,
    base: `http://127.0.0.1:${port}`,
    albums,
    calls,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

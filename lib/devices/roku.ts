// Roku External Control Protocol driver (port 8060). https://developer.roku.com/docs/developer-program/dev-tools/external-control-api.md
import { DeviceError, type ActiveApp, type DeviceInfo, type LaunchRequest, type MediaPlayer, type RemoteKey, type SearchLaunchRequest, type TvDriver } from './types';
import { assertHomeAddress } from './address';

/** Roku channel ids (handoff 2.4). */
export const ROKU_CHANNELS = { netflix: '12', prime: '13', hulu: '2285', youtube: '837' } as const;

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)</${name}>`));
  return m ? decodeXml(m[1].trim()) : null;
}

function attr(xml: string, el: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${el}\\b[^>]*\\b${name}="([^"]*)"`));
  return m ? decodeXml(m[1]) : null;
}

function decodeXml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function ms(s: string | null): number | null {
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

export function parseActiveApp(xml: string): ActiveApp {
  const m = xml.match(/<app\b([^>]*)>([^<]*)<\/app>/);
  if (!m) return { id: null, name: 'Home' };
  const id = m[1].match(/\bid="([^"]*)"/)?.[1] ?? null;
  return { id, name: decodeXml(m[2].trim()) };
}

export function parseDeviceInfo(xml: string): DeviceInfo {
  const mode = tag(xml, 'power-mode');
  return {
    name: tag(xml, 'user-device-name') || tag(xml, 'friendly-device-name') || tag(xml, 'model-name') || 'Roku',
    model: tag(xml, 'model-name') || tag(xml, 'model-number') || '',
    serial: tag(xml, 'serial-number') || '',
    powerMode: mode === 'PowerOn' ? 'on' : mode ? 'standby' : 'unknown',
  };
}

export function parseMediaPlayer(xml: string): MediaPlayer {
  const state = (attr(xml, 'player', 'state') ?? 'unknown') as MediaPlayer['state'];
  return {
    state: ['play', 'pause', 'stop', 'buffer', 'close', 'none'].includes(state) ? state : 'unknown',
    appId: attr(xml, 'plugin', 'id'),
    positionMs: ms(tag(xml, 'position')),
    durationMs: ms(tag(xml, 'duration')),
  };
}

export class RokuDriver implements TvDriver {
  private readonly base: string;

  constructor(address: string, port = 8060, private readonly timeoutMs = 3000) {
    assertHomeAddress(address);
    this.base = `http://${address}:${port}`;
  }

  private async call(method: 'GET' | 'POST', path: string): Promise<string> {
    let res: Response;
    try {
      res = await fetch(this.base + path, { method, signal: AbortSignal.timeout(this.timeoutMs), cache: 'no-store' });
    } catch (err) {
      throw new DeviceError(`TV did not answer (${err instanceof Error ? err.name : 'error'})`, true);
    }
    const text = await res.text();
    if (res.status === 403) throw new DeviceError('The TV refused control. Turn on "Control by mobile apps" on the Roku.');
    if (!res.ok) throw new DeviceError(`TV answered ${res.status} to ${method} ${path.split('?')[0]}`);
    return text;
  }

  async keypress(key: RemoteKey): Promise<void> {
    await this.call('POST', `/keypress/${encodeURIComponent(key)}`);
  }

  async launch(req: LaunchRequest): Promise<void> {
    const q = new URLSearchParams();
    if (req.contentId) q.set('contentId', req.contentId);
    if (req.mediaType) q.set('mediaType', req.mediaType);
    for (const [k, v] of Object.entries(req.params ?? {})) q.set(k, v);
    const qs = q.toString();
    await this.call('POST', `/launch/${encodeURIComponent(req.channelId)}${qs ? `?${qs}` : ''}`);
  }

  async searchLaunch(req: SearchLaunchRequest): Promise<void> {
    const q = new URLSearchParams({ keyword: req.keyword, 'provider-id': req.providerId, launch: 'true' });
    if (req.type) q.set('type', req.type);
    await this.call('POST', `/search/browse?${q.toString()}`);
  }

  async activeApp(): Promise<ActiveApp> {
    return parseActiveApp(await this.call('GET', '/query/active-app'));
  }

  async deviceInfo(): Promise<DeviceInfo> {
    return parseDeviceInfo(await this.call('GET', '/query/device-info'));
  }

  async mediaPlayer(): Promise<MediaPlayer> {
    return parseMediaPlayer(await this.call('GET', '/query/media-player'));
  }

  async powerOn(): Promise<void> {
    await this.keypress('PowerOn');
  }

  async powerOff(): Promise<void> {
    await this.keypress('PowerOff');
  }
}

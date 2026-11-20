import { RokuDriver } from './roku';
import type { LaunchRequest, RemoteKey, SearchLaunchRequest, TvDriver } from './types';

export interface TvTarget {
  type: string;
  address: string;
  port: number;
}

/**
 * When the hub last told each TV (by address) to open something or turn on (real time, ms). The power-on watcher
 * (lib/snapback.ts) uses it to tell a TV someone turned on from one the hub woke itself (a trailer, a playlist, a
 * routine), which it leaves alone.
 */
const lastWake = new Map<string, number>();

export function lastHubWake(tv: TvTarget): number | null {
  return lastWake.get(`${tv.address}:${tv.port}`) ?? null;
}

/** Tests only. */
export function resetHubWakesForTests(): void {
  lastWake.clear();
}

function noting(tv: TvTarget, d: TvDriver): TvDriver {
  const mark = () => lastWake.set(`${tv.address}:${tv.port}`, Date.now());
  return {
    keypress: (key: RemoteKey) => {
      if (key === 'PowerOn') mark();
      return d.keypress(key);
    },
    launch: (req: LaunchRequest) => {
      mark();
      return d.launch(req);
    },
    searchLaunch: (req: SearchLaunchRequest) => {
      mark();
      return d.searchLaunch(req);
    },
    activeApp: () => d.activeApp(),
    deviceInfo: () => d.deviceInfo(),
    mediaPlayer: () => d.mediaPlayer(),
    powerOn: () => {
      mark();
      return d.powerOn();
    },
    powerOff: () => d.powerOff(),
  };
}

/** The driver for a TV. New TV types (Samsung, later) add a case here and nothing else changes. */
export function driverFor(tv: TvTarget, timeoutMs?: number): TvDriver {
  switch (tv.type) {
    case 'roku':
      return noting(tv, new RokuDriver(tv.address, tv.port, timeoutMs));
    default:
      throw new Error(`No driver for TV type ${tv.type}`);
  }
}

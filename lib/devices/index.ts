import { RokuDriver } from './roku';
import type { TvDriver } from './types';

export interface TvTarget {
  type: string;
  address: string;
  port: number;
}

/** The driver for a TV. New TV types (Samsung, later) add a case here and nothing else changes. */
export function driverFor(tv: TvTarget, timeoutMs?: number): TvDriver {
  switch (tv.type) {
    case 'roku':
      return new RokuDriver(tv.address, tv.port, timeoutMs);
    default:
      throw new Error(`No driver for TV type ${tv.type}`);
  }
}

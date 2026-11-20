// The device layer (handoff section 2). One driver per TV type; Roku now, Samsung later, nothing else changes.

export type RemoteKey =
  | 'Home' | 'Back' | 'Select' | 'Left' | 'Right' | 'Up' | 'Down' | 'Play' | 'Rev' | 'Fwd' | 'Info'
  | 'InstantReplay' | 'VolumeUp' | 'VolumeDown' | 'VolumeMute' | 'PowerOn' | 'PowerOff';

export interface ActiveApp {
  id: string | null;
  name: string;
}

export interface DeviceInfo {
  name: string;
  model: string;
  serial: string;
  powerMode: 'on' | 'standby' | 'unknown';
}

export interface MediaPlayer {
  state: 'play' | 'pause' | 'stop' | 'buffer' | 'close' | 'none' | 'unknown';
  appId: string | null;
  positionMs: number | null;
  durationMs: number | null;
}

export interface LaunchRequest {
  channelId: string;
  contentId?: string;
  mediaType?: 'movie' | 'series' | 'episode' | 'season' | 'shortFormVideo' | 'tvSpecial' | 'live';
  /** More launch parameters, handed to the channel (pairing the Popcorn Pilot channel: the hub address and token). */
  params?: Record<string, string>;
}

export interface SearchLaunchRequest {
  keyword: string;
  type?: 'movie' | 'tv-show';
  providerId: string;
}

/** Which route a launch used, recorded per title (handoff 2.4). */
export type LaunchRoute = 'deep_link' | 'search';

export interface TvDriver {
  keypress(key: RemoteKey): Promise<void>;
  launch(req: LaunchRequest): Promise<void>;
  searchLaunch(req: SearchLaunchRequest): Promise<void>;
  activeApp(): Promise<ActiveApp>;
  deviceInfo(): Promise<DeviceInfo>;
  mediaPlayer(): Promise<MediaPlayer>;
  powerOn(): Promise<void>;
  powerOff(): Promise<void>;
}

export class DeviceError extends Error {
  constructor(message: string, readonly offline = false) {
    super(message);
  }
}

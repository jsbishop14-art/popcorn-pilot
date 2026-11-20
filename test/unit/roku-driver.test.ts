// Check 4: the Roku driver against the fake Roku. Check 5 (discovery part): SSDP finds the fake Roku.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFakeRoku, type FakeRoku } from '../fake-roku/server';
import { RokuDriver, ROKU_CHANNELS, parseActiveApp } from '@/lib/devices/roku';
import { discoverRokus, parseSsdpLocation } from '@/lib/devices/discovery';
import { DeviceError } from '@/lib/devices/types';
import { parseTvAddress } from '@/lib/devices/address';

let roku: FakeRoku;
let driver: RokuDriver;

beforeAll(async () => {
  roku = await startFakeRoku({ name: 'Test Roku', serial: 'SER123', ssdpPort: 0 });
  driver = new RokuDriver('127.0.0.1', roku.port);
});
afterAll(async () => roku.close());

describe('Roku ECP driver (check 4)', () => {
  it('sends a keypress', async () => {
    await driver.keypress('Select');
    expect(roku.calls.at(-1)).toMatchObject({ method: 'POST', path: '/keypress/Select' });
  });

  it('launches a channel with a content id (deep link)', async () => {
    await driver.launch({ channelId: ROKU_CHANNELS.netflix, contentId: '80057281', mediaType: 'series' });
    expect(roku.calls.at(-1)).toMatchObject({ method: 'POST', path: '/launch/12', query: { contentId: '80057281', mediaType: 'series' } });
    expect(await driver.activeApp()).toEqual({ id: '12', name: 'Netflix' });
  });

  it('search-launches with keyword, type, provider id and launch=true', async () => {
    await driver.searchLaunch({ keyword: 'Placeholder Show', type: 'tv-show', providerId: ROKU_CHANNELS.hulu });
    expect(roku.calls.at(-1)).toMatchObject({
      method: 'POST',
      path: '/search/browse',
      query: { keyword: 'Placeholder Show', type: 'tv-show', 'provider-id': '2285', launch: 'true' },
    });
    expect((await driver.activeApp()).id).toBe('2285');
  });

  it('reads the active app, including the Roku home screen', async () => {
    await driver.keypress('Home');
    expect(await driver.activeApp()).toEqual({ id: null, name: 'Roku' });
    expect(parseActiveApp('<active-app><app id="13" type="appl">Prime Video</app></active-app>')).toEqual({ id: '13', name: 'Prime Video' });
  });

  it('reads device info', async () => {
    expect(await driver.deviceInfo()).toEqual({ name: 'Test Roku', model: 'Roku Ultra', serial: 'SER123', powerMode: 'on' });
  });

  it('reads the media player', async () => {
    await driver.launch({ channelId: '13', contentId: 'B0X', mediaType: 'movie' });
    expect(await driver.mediaPlayer()).toEqual({ state: 'play', appId: '13', positionMs: 120000, durationMs: 1320000 });
  });

  it('turns power off and on', async () => {
    await driver.powerOff();
    expect(roku.calls.at(-1)?.path).toBe('/keypress/PowerOff');
    expect((await driver.deviceInfo()).powerMode).toBe('standby');
    await driver.powerOn();
    expect(roku.calls.at(-1)?.path).toBe('/keypress/PowerOn');
    expect((await driver.deviceInfo()).powerMode).toBe('on');
  });

  it('reports an offline TV as offline', async () => {
    const off = new RokuDriver('127.0.0.1', 1, 500);
    await expect(off.deviceInfo()).rejects.toMatchObject({ offline: true });
  });

  it('explains a Roku that refuses control', async () => {
    const refusing = await startFakeRoku({ refuseControl: true });
    try {
      const err = await new RokuDriver('127.0.0.1', refusing.port).keypress('Home').catch((e) => e);
      expect(err).toBeInstanceOf(DeviceError);
      expect(String(err.message)).toMatch(/Control by mobile apps/);
    } finally {
      await refusing.close();
    }
  });

  it('refuses addresses outside the home network (control)', () => {
    expect(() => new RokuDriver('8.8.8.8')).toThrow(DeviceError);
    expect(() => new RokuDriver('example.com')).toThrow(DeviceError);
    expect(parseTvAddress('192.168.1.40')).toEqual({ address: '192.168.1.40', port: 8060 });
    expect(parseTvAddress('10.0.0.5:18060')).toEqual({ address: '10.0.0.5', port: 18060 });
    expect(parseTvAddress('172.32.0.1')).toBeNull();
    expect(parseTvAddress('1.2.3.4')).toBeNull();
  });
});

describe('discovery (check 5)', () => {
  it('finds the fake Roku over SSDP', async () => {
    process.env.PP_SSDP_TARGET = `127.0.0.1:${roku.ssdpPort}`;
    const found = await discoverRokus(800);
    expect(found).toEqual([{ address: '127.0.0.1', port: roku.port, name: 'Test Roku', model: 'Roku Ultra', serial: 'SER123' }]);
  });

  it('finds nothing when no Roku answers (control)', async () => {
    process.env.PP_SSDP_TARGET = '127.0.0.1:9';
    expect(await discoverRokus(400)).toEqual([]);
  });

  it('ignores SSDP answers that are not Rokus or not on the home network', () => {
    expect(parseSsdpLocation('HTTP/1.1 200 OK\r\nST: roku:ecp\r\nLocation: http://192.168.1.40:8060/\r\n')).toEqual({ address: '192.168.1.40', port: 8060 });
    expect(parseSsdpLocation('HTTP/1.1 200 OK\r\nST: upnp:rootdevice\r\nLocation: http://192.168.1.40:8060/\r\n')).toBeNull();
    expect(parseSsdpLocation('HTTP/1.1 200 OK\r\nST: roku:ecp\r\nLocation: http://93.184.216.34:8060/\r\n')).toBeNull();
  });
});

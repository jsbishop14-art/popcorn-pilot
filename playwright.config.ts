// Browser tests run against the production build (next start) and the fake Roku. Every run starts from an empty hub.
// Order: first-run sets the PINs, then the screens (phone and desktop width), then the HTTP permission map, then the
// lockout (it locks PIN entry for a minute, so it runs last).
import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const DATA = '.tmp/e2e-data';

export default defineConfig({
  testDir: 'test/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'first-run', testMatch: /first-run\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    { name: 'phone', testMatch: /screens\.spec\.ts|tvs\.spec\.ts|idle\.spec\.ts/, dependencies: ['first-run'], use: { ...devices['Pixel 7'] } },
    // Browse (PP2) runs after the phone tests, which add the fake Roku as "Living room" and a kid profile.
    { name: 'browse-phone', testMatch: /browse\.spec\.ts/, dependencies: ['phone'], use: { ...devices['Pixel 7'] } },
    { name: 'desktop', testMatch: /screens\.spec\.ts/, dependencies: ['browse-phone'], use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'browse-desktop', testMatch: /browse\.spec\.ts/, dependencies: ['desktop'], use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    // Playlists and playback (PP3) after Browse; they add the second fake Roku as "Bedroom".
    { name: 'playback-phone', testMatch: /playback\.spec\.ts/, dependencies: ['browse-desktop'], use: { ...devices['Pixel 7'] } },
    { name: 'playback-desktop', testMatch: /playback\.spec\.ts/, dependencies: ['playback-phone'], use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    // Kid safeguards (PP4) after playback: the PP2 and PP3 tests played titles for the kid (the watch log).
    { name: 'kid-phone', testMatch: /kid\.spec\.ts/, dependencies: ['playback-desktop'], use: { ...devices['Pixel 7'] } },
    { name: 'kid-desktop', testMatch: /kid\.spec\.ts/, dependencies: ['kid-phone'], use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'http-map', testMatch: /http-map\.spec\.ts/, dependencies: ['kid-desktop'] },
    { name: 'lockout', testMatch: /lockout\.spec\.ts/, dependencies: ['http-map'], use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'npx tsx test/fake-roku/run.ts',
      url: 'http://127.0.0.1:18061',
      reuseExistingServer: false,
      stdout: 'pipe',
    },
    {
      command: `rm -rf ${DATA} && PP_DATA_DIR=${DATA} PP_NO_OUTSIDE_CALLS=1 PP_SSDP_TARGET=127.0.0.1:11900 NEXT_TELEMETRY_DISABLED=1 npx next start -p ${PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${PORT}/api/auth/state`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
    },
  ],
});

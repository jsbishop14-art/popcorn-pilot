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
    { name: 'desktop', testMatch: /screens\.spec\.ts/, dependencies: ['phone'], use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'http-map', testMatch: /http-map\.spec\.ts/, dependencies: ['desktop'] },
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
      command: `rm -rf ${DATA} && PP_DATA_DIR=${DATA} PP_SSDP_TARGET=127.0.0.1:11900 NEXT_TELEMETRY_DISABLED=1 npx next start -p ${PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${PORT}/api/auth/state`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
    },
  ],
});

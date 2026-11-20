/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
    // instrumentation.ts starts the playback engine timer when the hub starts (PP3).
    instrumentationHook: true,
    // Pages show the hub's current state: the router does not reuse a page fetched earlier. The playlist screens
    // also load their data from the hub when they open, since a copy can still come back from the router.
    staleTimes: { dynamic: 0 },
  },
};

export default nextConfig;

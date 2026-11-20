/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
    // instrumentation.ts starts the playback engine timer when the hub starts (PP3).
    instrumentationHook: true,
  },
};

export default nextConfig;

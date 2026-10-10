import type { NextConfig } from 'next';

const API = process.env.API_INTERNAL_URL ?? process.env.API_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@sahyadri/ui', '@sahyadri/shared'],
  output: 'standalone',
  outputFileTracingRoot: require('node:path').join(__dirname, '../../'),
  // The admin talks to the API through its own origin, so login cookies are first-party.
  async rewrites() {
    return [
      { source: '/api/v1/:path*', destination: `${API}/api/v1/:path*` },
      { source: '/media/:path*', destination: `${API}/media/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default config;

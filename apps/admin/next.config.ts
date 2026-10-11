import type { NextConfig } from 'next';

// Local development only: on Vercel the root vercel.json routes /api and /media to the api service.
const API = process.env.API_INTERNAL_URL ?? process.env.API_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  // The admin lives at /admin on the shop's domain (see the root vercel.json and lib/base-path.ts).
  basePath: '/admin',
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@sahyadri/ui', '@sahyadri/shared'],
  output: 'standalone',
  outputFileTracingRoot: require('node:path').join(__dirname, '../../'),
  // The admin talks to the API through its own origin, so login cookies are first-party.
  async rewrites() {
    return [
      // The API sits at the domain root, outside /admin. On Vercel the root vercel.json routes these;
      // locally (next dev/start) these rewrites do.
      { source: '/api/v1/:path*', destination: `${API}/api/v1/:path*`, basePath: false },
      { source: '/media/:path*', destination: `${API}/media/:path*`, basePath: false },
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

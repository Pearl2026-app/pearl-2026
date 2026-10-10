import type { NextConfig } from 'next';

const API = process.env.API_INTERNAL_URL ?? process.env.API_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@sahyadri/ui', '@sahyadri/shared'],
  output: 'standalone',
  outputFileTracingRoot: require('node:path').join(__dirname, '../../'),
  compress: true,
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
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      { source: '/media/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ];
  },
};

export default config;

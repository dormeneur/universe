import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  typescript: {
    // Type errors fail the build. CI runs `typecheck` separately, but a
    // production build must never ship past a type error either.
    ignoreBuildErrors: false,
  },

  // Next 16 removed the built-in ESLint integration, so linting is purely a
  // separate CI step (`npm run lint`) rather than something the build repeats.

  // The archive is campus-only and must never be indexed (PRD A2-5, AR-4).
  // Route-level metadata sets `noindex` too; this is defence in depth for
  // crawlers that ignore meta tags but honour headers.
  headers() {
    return Promise.resolve([
      {
        source: '/archive/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ]);
  },
};

export default nextConfig;

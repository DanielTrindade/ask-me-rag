import type { NextConfig } from 'next';
import { buildStaticContentSecurityPolicy } from './lib/csp';

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: buildStaticContentSecurityPolicy(),
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'geolocation=(), microphone=(), camera=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains',
  },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  // Dev only. Next blocks /_next/* and the HMR websocket for any origin that is
  // not localhost, so without these a phone loads the page but never hydrates.
  // Tailscale first (stable address, works off the local network too); the LAN
  // entry is DHCP and needs updating if the router hands out a new lease.
  allowedDevOrigins: ['100.116.237.127', '192.168.100.184'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

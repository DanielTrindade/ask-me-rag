/**
 * Builds the Content-Security-Policy header value for a request.
 *
 * Next.js injects inline bootstrap scripts into every page, so `script-src`
 * must carry a per-request nonce — a static `'self'`-only policy blocks
 * hydration entirely. The nonce is generated in proxy.ts and forwarded to
 * Next.js via the request headers so it can tag its own script tags.
 */
export function buildContentSecurityPolicy(
  nonce: string,
  isDev = process.env.NODE_ENV === 'development',
): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    // Turbopack HMR evaluates modules with eval() in dev
    ...(isDev ? ["'unsafe-eval'"] : []),
  ];

  // Dev needs the HMR websocket
  const connectSrc = ["'self'", ...(isDev ? ['ws:'] : [])];

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src ${connectSrc.join(' ')}`,
    "font-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

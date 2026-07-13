function buildPolicy(scriptSrc: string[], isDev: boolean): string {
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

/**
 * Builds the strict per-request policy used by dynamic admin documents.
 * Next.js reads the nonce from the request CSP header and applies it to its
 * bootstrap scripts.
 */
export function buildNonceContentSecurityPolicy(
  nonce: string,
  isDev = process.env.NODE_ENV === 'development',
): string {
  return buildPolicy(
    [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    isDev,
  );
}

/**
 * Builds the stable policy used by prerendered public documents.
 * Next.js emits inline bootstrap scripts for static pages, so this policy
 * follows the framework's static CSP guidance and limits unsafe-inline to
 * script-src while preserving all other hardening directives.
 */
export function buildStaticContentSecurityPolicy(
  isDev = process.env.NODE_ENV === 'development',
): string {
  return buildPolicy(
    ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    isDev,
  );
}

export function isAdminDocumentPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

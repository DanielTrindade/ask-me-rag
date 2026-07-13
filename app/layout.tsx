import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';
import { Providers } from './providers';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// viewport-fit=cover lets the chat fill notched screens; safe-area padding
// in globals.css keeps the composer above the home indicator.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const metadataTitle = 'Daniel Trindade — Portfólio interativo';
const metadataDescription =
  'Converse com um portfólio baseado em experiências, projetos e decisões técnicas de Daniel Trindade.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: metadataTitle,
    template: '%s | Daniel Trindade',
  },
  description: metadataDescription,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: metadataTitle,
    description: metadataDescription,
    siteName: 'Daniel Trindade',
    locale: 'pt_BR',
    alternateLocale: ['en_US'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: metadataTitle,
    description: metadataDescription,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The CSP nonce (set in proxy.ts) changes per request, so pages cannot be
  // statically prerendered: a build-time HTML snapshot would ship scripts
  // whose nonce never matches the response header, blocking hydration.
  // Reading the request headers opts every route into dynamic rendering.
  await headers();

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

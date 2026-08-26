import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
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

const defaultSiteUrl = 'http://localhost:3000';

function resolveSiteUrl(raw: string | undefined): URL {
  try {
    return new URL(raw ?? defaultSiteUrl);
  } catch {
    return new URL(defaultSiteUrl);
  }
}

const siteUrl = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
const metadataTitle = 'Daniel Trindade — Portfólio interativo';
const metadataDescription =
  'Converse com um portfólio baseado em experiências, projetos e decisões técnicas de Daniel Trindade.';

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: metadataTitle,
    template: '%s | Daniel Trindade',
  },
  description: metadataDescription,
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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

import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Geist, Geist_Mono } from 'next/font/google';
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

// Display face, used only at heading sizes. Its squared bowls and tight
// apertures give the name a shape Geist alone never had; body text stays Geist.
const bricolage = Bricolage_Grotesque({
  variable: '--font-bricolage',
  subsets: ['latin'],
  display: 'swap',
});

// viewport-fit=cover lets the chat fill notched screens; safe-area padding
// in globals.css keeps the composer above the home indicator.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Paints the mobile browser chrome the same paper/ink as the page instead of
  // leaving a light bar above a dark app.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F0EFEC' },
    { media: '(prefers-color-scheme: dark)', color: '#16151A' },
  ],
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
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
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

export const metadata: Metadata = {
  title: 'Pergunte sobre mim',
  description: 'Um chat pessoal que responde com base em experiências, projetos e trajetória profissional.',
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

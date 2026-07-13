import { connection } from 'next/server';

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Admin documents use a per-request CSP nonce. Waiting for the incoming
  // request keeps this segment dynamic so Next.js can apply that nonce to its
  // bootstrap scripts without making the public portfolio dynamic as well.
  await connection();

  return children;
}

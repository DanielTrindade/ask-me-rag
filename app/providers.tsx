'use client';

import Link from 'next/link';
import { LinkProvider } from '@astryxdesign/core/Link';
import { Theme } from '@astryxdesign/core/theme';
import { danielPortfolioTheme } from '@/lib/daniel-portfolio';
import { ToastProvider } from '@/components/ui/toast';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Theme theme={danielPortfolioTheme} mode="system">
      <LinkProvider component={Link}>
        <ToastProvider>{children}</ToastProvider>
      </LinkProvider>
    </Theme>
  );
}

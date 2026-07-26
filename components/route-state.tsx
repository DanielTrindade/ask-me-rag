'use client';

import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useEffect, useState } from 'react';
import { AppBrand } from '@/components/brand/app-brand';
import { LOCALE_STORAGE_KEY } from '@/lib/chat-session';
import { t, type Locale } from '@/lib/i18n';

type RouteStateProps = {
  kind: 'error' | 'loading' | 'not-found';
  reset?: () => void;
};

export function RouteState({ kind, reset }: RouteStateProps) {
  const [locale, setLocale] = useState<Locale>('pt');

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const savedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
        if (savedLocale === 'pt' || savedLocale === 'en') {
          setLocale(savedLocale);
          document.documentElement.lang = savedLocale === 'pt' ? 'pt-BR' : 'en';
        }
      } catch {
        // Keep the Portuguese fallback when storage is unavailable.
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (kind === 'loading') {
    return (
      <main className="route-state" aria-busy="true" aria-live="polite">
        <div className="route-loading" role="status">
          <AppBrand kind="mark" />
          <span>{t(locale, 'route.loading')}</span>
        </div>
      </main>
    );
  }

  const isError = kind === 'error';

  return (
    <main className="route-state">
      <Card className="route-state-card" padding={6}>
        <VStack gap={5}>
          {isError ? <AppBrand kind="mark" /> : <span className="route-state-code">404</span>}
          <VStack gap={2}>
            <Heading level={1}>
              {t(locale, isError ? 'route.errorTitle' : 'route.notFoundTitle')}
            </Heading>
            <Text as="p" color="secondary">
              {t(locale, isError ? 'route.errorBody' : 'route.notFoundBody')}
            </Text>
          </VStack>
          {isError ? (
            <HStack gap={2} wrap="wrap">
              <Button variant="primary" label={t(locale, 'route.retry')} onClick={reset} />
              <Button variant="ghost" label={t(locale, 'route.home')} href="/" />
            </HStack>
          ) : (
            <Button variant="primary" label={t(locale, 'route.backToChat')} href="/" />
          )}
        </VStack>
      </Card>
    </main>
  );
}

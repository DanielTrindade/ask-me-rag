'use client';

import { Button } from '@astryxdesign/core/Button';
import type { Locale } from '@/lib/i18n';

export function LocaleToggle({ locale, onChange }: { locale: Locale; onChange: (locale: Locale) => void }) {
  const nextLocale = locale === 'pt' ? 'en' : 'pt';

  return (
    <Button
      label={locale === 'pt' ? 'PT-BR' : 'EN'}
      tooltip={locale === 'pt' ? 'Switch to English' : 'Mudar para português'}
      variant="ghost"
      size="sm"
      onClick={() => onChange(nextLocale)}
    />
  );
}

'use client';
import type { Locale } from '@/lib/i18n';

export function LocaleToggle({ locale, onChange }: { locale: Locale; onChange: (l: Locale) => void }) {
  return (
    <button
      onClick={() => onChange(locale === 'pt' ? 'en' : 'pt')}
      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)]
                 transition-transform duration-150 ease-out active:scale-[0.97]"
    >
      {locale === 'pt' ? '🇧🇷 PT' : '🇺🇸 EN'}
    </button>
  );
}

'use client';
import type { Locale } from '@/lib/i18n';

export function LocaleToggle({ locale, onChange }: { locale: Locale; onChange: (l: Locale) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(locale === 'pt' ? 'en' : 'pt')}
      className="focus-ring inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white/80 px-3 py-2 text-xs font-semibold text-[var(--muted)] shadow-sm backdrop-blur
                 transition-[background-color,border-color,color,transform] duration-150 ease-out hover:border-[var(--accent)] hover:text-[var(--accent-strong)] active:scale-[0.97]"
      aria-label="Alternar idioma"
    >
      <span aria-hidden="true">{locale === 'pt' ? '🇧🇷' : '🇺🇸'}</span>
      {locale.toUpperCase()}
    </button>
  );
}

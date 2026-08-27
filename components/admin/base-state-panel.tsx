'use client';

import type { BaseSummary } from '@/components/admin/document-list';
import { t, type Locale } from '@/lib/i18n';

// Built once at module scope and pinned to UTC. Constructing them per render
// re-allocates on every keystroke, and an unpinned zone formats one date on the
// server and another in the browser, which is a hydration mismatch.
const COUNT_FORMATTERS: Record<Locale, Intl.NumberFormat> = {
  pt: new Intl.NumberFormat('pt-BR'),
  en: new Intl.NumberFormat('en-US'),
};

const DAY_FORMATTERS: Record<Locale, Intl.DateTimeFormat> = {
  pt: new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }),
  en: new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }),
};

function formatCount(value: number, locale: Locale): string {
  return COUNT_FORMATTERS[locale].format(value);
}

function formatUpdated(value: string | null, locale: Locale): string {
  if (!value) return '—';
  return DAY_FORMATTERS[locale].format(new Date(value));
}

/**
 * The one thing the rail was missing: the size of the base, stated once. It
 * used to be derivable only by counting rows and reading every date.
 */
export function BaseStatePanel({
  locale,
  summary,
}: {
  locale: Locale;
  summary: BaseSummary;
}) {
  return (
    <section className="admin-base-state" aria-labelledby="admin-base-state-title">
      <h2 className="admin-base-state-heading" id="admin-base-state-title">
        {t(locale, 'admin.baseState')}
      </h2>
      <dl>
        <div className="admin-base-row">
          <dt>{t(locale, 'admin.baseDocuments')}</dt>
          <dd>{formatCount(summary.documents, locale)}</dd>
        </div>
        <div className="admin-base-row">
          <dt>{t(locale, 'admin.baseChunks')}</dt>
          <dd>{formatCount(summary.chunks, locale)}</dd>
        </div>
        <div className="admin-base-row">
          <dt>{t(locale, 'admin.baseUpdated')}</dt>
          <dd className="is-quiet">{formatUpdated(summary.lastIngestedAt, locale)}</dd>
        </div>
      </dl>
    </section>
  );
}

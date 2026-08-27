'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { useState, type ReactNode } from 'react';
import { BaseStatePanel } from '@/components/admin/base-state-panel';
import { DocumentList, type BaseSummary } from '@/components/admin/document-list';
import { UploadForm } from '@/components/upload/upload-form';
import type { Locale } from '@/lib/i18n';

const EMPTY_SUMMARY: BaseSummary = { documents: 0, chunks: 0, lastIngestedAt: null };

/**
 * Owns the two-column workspace because the sidebar figures come from the same
 * fetch the document list already makes. The help panel is passed in from the
 * server page so its copy stays out of the client bundle.
 */
export function AdminSourcesPanel({
  locale = 'pt',
  help,
}: {
  locale?: Locale;
  help?: ReactNode;
}) {
  const [refreshToken, setRefreshToken] = useState(0);
  const [summary, setSummary] = useState<BaseSummary>(EMPTY_SUMMARY);

  return (
    <section className="admin-grid">
      <VStack gap={3}>
        <UploadForm locale={locale} onUploaded={() => setRefreshToken((token) => token + 1)} />
        <DocumentList
          locale={locale}
          refreshToken={refreshToken}
          onSummaryChange={setSummary}
        />
      </VStack>
      <VStack gap={4}>
        <BaseStatePanel locale={locale} summary={summary} />
        {help}
      </VStack>
    </section>
  );
}

'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';
import { DocumentList } from '@/components/admin/document-list';
import { UploadForm } from '@/components/upload/upload-form';
import type { Locale } from '@/lib/i18n';

export function AdminSourcesPanel({ locale = 'pt' }: { locale?: Locale }) {
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <VStack gap={3}>
      <UploadForm locale={locale} onUploaded={() => setRefreshToken((token) => token + 1)} />
      <DocumentList locale={locale} refreshToken={refreshToken} />
    </VStack>
  );
}

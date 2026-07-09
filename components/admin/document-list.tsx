'use client';

import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { List, ListItem } from '@astryxdesign/core/List';
import { StackItem } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { t, type Locale } from '@/lib/i18n';

interface DocumentSummary {
  source: string;
  chunkCount: number;
  lastIngestedAt: string | null;
}

function formatDate(value: string | null, locale: Locale): string {
  if (!value) return '-';

  return new Date(value).toLocaleDateString(locale === 'pt' ? 'pt-BR' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function DocumentList({
  locale = 'pt',
  refreshToken = 0,
}: {
  locale?: Locale;
  refreshToken?: number;
}) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/documents');
      if (response.status === 401) {
        router.replace('/admin/login');
        return;
      }
      if (!response.ok) throw new Error('list failed');

      const data = (await response.json()) as { documents: DocumentSummary[] };
      setDocuments(data.documents);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  async function onDelete(source: string) {
    setDeleting(source);
    try {
      const response = await fetch(`/api/admin/documents?source=${encodeURIComponent(source)}`, {
        method: 'DELETE',
      });
      if (response.status === 401) {
        router.replace('/admin/login');
        return;
      }
      if (!response.ok) throw new Error('delete failed');

      toast(t(locale, 'admin.documentsDeleted'));
      await load();
    } catch {
      toast(t(locale, 'admin.documentsDeleteError'));
    } finally {
      setDeleting(null);
      setConfirming(null);
    }
  }

  return (
    <Card padding={6}>
      <VStack gap={5}>
        <VStack gap={2}>
          <Heading level={2}>{t(locale, 'admin.documentsTitle')}</Heading>
          <Text as="p" color="secondary">
            {t(locale, 'admin.documentsBody')}
          </Text>
        </VStack>

        {failed && (
          <Text as="p" color="secondary">
            {t(locale, 'admin.documentsError')}
          </Text>
        )}

        {!failed && documents.length === 0 && (
          <Text as="p" color="secondary">
            {t(locale, 'admin.documentsEmpty')}
          </Text>
        )}

        {!failed && documents.length > 0 && (
          <List density="compact" hasDividers>
            {documents.map((doc) => (
              <ListItem
                key={doc.source}
                label={doc.source}
                description={`${doc.chunkCount} ${t(locale, 'admin.documentsChunks')} - ${formatDate(doc.lastIngestedAt, locale)}`}
                endContent={
                  confirming === doc.source ? (
                    <HStack gap={2} vAlign="center">
                      <StackItem>
                        <Button
                          size="sm"
                          variant="ghost"
                          label={t(locale, 'admin.documentsCancel')}
                          isDisabled={deleting === doc.source}
                          onClick={() => setConfirming(null)}
                        />
                      </StackItem>
                      <StackItem>
                        <Button
                          size="sm"
                          variant="destructive"
                          label={t(locale, 'admin.documentsConfirm')}
                          isLoading={deleting === doc.source}
                          onClick={() => void onDelete(doc.source)}
                        />
                      </StackItem>
                    </HStack>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      label={t(locale, 'admin.documentsDelete')}
                      isDisabled={deleting !== null}
                      onClick={() => setConfirming(doc.source)}
                    />
                  )
                }
              />
            ))}
          </List>
        )}
      </VStack>
    </Card>
  );
}

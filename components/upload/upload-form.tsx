'use client';

import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { FileInput } from '@astryxdesign/core/FileInput';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { t, type Locale } from '@/lib/i18n';

type UploadResult = {
  name: string;
  status: 'success' | 'error';
  detail: string;
};

export function UploadForm({
  locale = 'pt',
  onUploaded,
}: {
  locale?: Locale;
  onUploaded?: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (files.length === 0 || busy) return;

    setBusy(true);
    setResults([]);

    let succeeded = 0;
    for (const file of files) {
      const form = new FormData();
      form.append('file', file);

      try {
        const response = await fetch('/api/ingest', {
          method: 'POST',
          body: form,
        });

        if (response.status === 401) {
          router.replace('/admin/login');
          return;
        }

        const data = (await response.json().catch(() => null)) as { inserted?: number; error?: string } | null;
        if (!response.ok) throw new Error(data?.error ?? t(locale, 'admin.error'));

        succeeded += 1;
        setResults((current) => [
          ...current,
          {
            name: file.name,
            status: 'success',
            detail: `${data?.inserted ?? 0} chunks`,
          },
        ]);
      } catch (error) {
        setResults((current) => [
          ...current,
          {
            name: file.name,
            status: 'error',
            detail: error instanceof Error ? error.message : t(locale, 'admin.error'),
          },
        ]);
      }
    }

    if (succeeded > 0) {
      toast(`${succeeded} ${succeeded === 1 ? 'documento adicionado' : 'documentos adicionados'}.`);
      setFiles([]);
      onUploaded?.();
    }
    setBusy(false);
  }

  return (
    <Card padding={6}>
      <form onSubmit={onSubmit}>
        <VStack gap={6}>
          <VStack gap={2}>
            <Heading level={2}>{t(locale, 'admin.sourcesTitle')}</Heading>
            <Text as="p" color="secondary">
              {t(locale, 'admin.sourcesBody')}
            </Text>
          </VStack>

          <FileInput
            label={t(locale, 'admin.fileLabel')}
            description={t(locale, 'admin.fileDescription')}
            value={files}
            onChange={(value) => setFiles(Array.isArray(value) ? value : value ? [value] : [])}
            placeholder={t(locale, 'admin.filePlaceholder')}
            accept=".pdf,.md,.txt"
            mode="dropzone"
            isMultiple
            maxFiles={10}
            maxSize={10 * 1024 * 1024}
            isLoading={busy}
          />

          {results.length > 0 && (
            <ul className="upload-results" aria-live="polite">
              {results.map((result) => (
                <li className="upload-result" key={result.name}>
                  <span>{result.name}</span>
                  <span>
                    {result.status === 'success' ? t(locale, 'admin.success') : t(locale, 'admin.error')} · {result.detail}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <HStack hAlign="end">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              label={busy ? t(locale, 'admin.uploading') : t(locale, 'admin.upload')}
              isLoading={busy}
              isDisabled={files.length === 0 || busy}
            />
          </HStack>
        </VStack>
      </form>
    </Card>
  );
}

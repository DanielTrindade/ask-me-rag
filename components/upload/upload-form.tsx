'use client';

import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { FileInput } from '@astryxdesign/core/FileInput';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { t, type Locale } from '@/lib/i18n';

type UploadResult = {
  id: string;
  name: string;
  status: 'processing' | 'success' | 'error' | 'cancelled';
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const toast = useToast();
  const router = useRouter();

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (files.length === 0 || busy) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setBusy(true);
    setResults([]);

    let succeeded = 0;
    try {
      for (const [index, file] of files.entries()) {
        if (controller.signal.aborted) break;

        const id = `${file.name}-${file.size}-${file.lastModified}-${index}`;
        const form = new FormData();
        form.append('file', file);
        setResults((current) => [
          ...current,
          { id, name: file.name, status: 'processing', detail: '' },
        ]);

        try {
          const response = await fetch('/api/ingest', {
            method: 'POST',
            body: form,
            signal: controller.signal,
          });

          if (response.status === 401) {
            router.replace('/admin/login');
            return;
          }

          const data = (await response.json().catch(() => null)) as
            | { inserted?: number; error?: string }
            | null;
          if (!response.ok) throw new Error(data?.error ?? t(locale, 'admin.error'));

          succeeded += 1;
          setResults((current) =>
            current.map((result) =>
              result.id === id
                ? {
                    ...result,
                    status: 'success',
                    detail: `${data?.inserted ?? 0} ${t(locale, 'admin.documentsChunks')}`,
                  }
                : result,
            ),
          );
        } catch (error) {
          const cancelled = error instanceof DOMException && error.name === 'AbortError';
          setResults((current) =>
            current.map((result) =>
              result.id === id
                ? {
                    ...result,
                    status: cancelled ? 'cancelled' : 'error',
                    detail: cancelled
                      ? t(locale, 'admin.cancelled')
                      : error instanceof Error
                        ? error.message
                        : t(locale, 'admin.error'),
                  }
                : result,
            ),
          );
          if (cancelled) break;
        }
      }

      if (succeeded > 0) {
        toast(
          `${succeeded} ${succeeded === 1 ? 'documento adicionado' : 'documentos adicionados'}.`,
        );
        setFiles([]);
        onUploaded?.();
      }
    } finally {
      abortControllerRef.current = null;
      setBusy(false);
    }
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

          {busy && (
            <Text as="p" type="supporting" color="secondary" role="status">
              {t(locale, 'admin.progressProcessed')} {' '}
              {results.filter((result) => result.status !== 'processing').length} {' '}
              {t(locale, 'admin.progressOf')} {files.length}
            </Text>
          )}

          {results.length > 0 && (
            <ul className="upload-results" aria-live="polite">
              {results.map((result) => {
                const statusLabel =
                  result.status === 'processing'
                    ? t(locale, 'admin.processing')
                    : result.status === 'success'
                      ? t(locale, 'admin.success')
                      : result.status === 'cancelled'
                        ? t(locale, 'admin.cancelled')
                        : t(locale, 'admin.error');

                return (
                  <li className="upload-result" key={result.id}>
                    <span className="upload-result-name">{result.name}</span>
                    <span className="upload-result-status">
                      {statusLabel}
                      {result.detail ? ` · ${result.detail}` : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <HStack gap={2} hAlign="end">
            {busy && (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                label={t(locale, 'admin.cancelUpload')}
                onClick={() => abortControllerRef.current?.abort()}
              />
            )}
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

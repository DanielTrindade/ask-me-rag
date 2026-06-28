'use client';

import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { t } from '@/lib/i18n';

export function LoginForm() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!password || busy) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(t('pt', data?.error === 'admin_not_configured' ? 'login.configError' : 'login.error'));
        return;
      }

      router.replace('/admin');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="login-card" padding={6}>
      <form onSubmit={submit}>
        <VStack gap={6}>
          <VStack gap={2}>
            <span className="brand-mark" aria-hidden="true">
              AI
            </span>
            <Heading level={1}>{t('pt', 'login.title')}</Heading>
            <Text as="p" color="secondary">
              {t('pt', 'login.body')}
            </Text>
          </VStack>

          <TextInput
            type="password"
            label={t('pt', 'login.password')}
            placeholder={t('pt', 'login.passwordPlaceholder')}
            value={password}
            onChange={(value) => {
              setPassword(value);
              setError(null);
            }}
            isRequired
            hasAutoFocus
            status={error ? { type: 'error', message: error } : undefined}
          />

          <Button
            type="submit"
            size="lg"
            variant="primary"
            label={busy ? t('pt', 'login.loading') : t('pt', 'login.submit')}
            isLoading={busy}
            isDisabled={!password || busy}
          />
        </VStack>
      </form>
    </Card>
  );
}

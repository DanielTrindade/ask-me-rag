'use client';

import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useEffect } from 'react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app/error]', error);
  }, [error]);

  return (
    <main className="route-state">
      <Card className="route-state-card" padding={6}>
        <VStack gap={5}>
          <span className="brand-mark" aria-hidden="true">AI</span>
          <VStack gap={2}>
            <Heading level={1}>Algo saiu do esperado</Heading>
            <Text as="p" color="secondary">
              A interface encontrou um erro, mas você pode tentar novamente sem perder o caminho.
            </Text>
          </VStack>
          <HStack gap={2} wrap="wrap">
            <Button variant="primary" label="Tentar novamente" onClick={reset} />
            <Button variant="ghost" label="Voltar ao início" href="/" />
          </HStack>
        </VStack>
      </Card>
    </main>
  );
}

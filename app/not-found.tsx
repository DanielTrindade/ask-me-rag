import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

export default function NotFound() {
  return (
    <main className="route-state">
      <Card className="route-state-card" padding={6}>
        <VStack gap={5}>
          <span className="route-state-code">404</span>
          <VStack gap={2}>
            <Heading level={1}>Esta página não existe</Heading>
            <Text as="p" color="secondary">
              O endereço pode ter mudado ou nunca ter feito parte deste portfólio.
            </Text>
          </VStack>
          <Button variant="primary" label="Voltar ao chat" href="/" />
        </VStack>
      </Card>
    </main>
  );
}

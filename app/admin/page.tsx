import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@astryxdesign/core/AppShell';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { TopNav } from '@astryxdesign/core/TopNav';
import { VStack } from '@astryxdesign/core/VStack';
import { UploadForm } from '@/components/upload/upload-form';
import { hasAdminSession } from '@/lib/admin-session';
import { t } from '@/lib/i18n';

export default async function AdminPage() {
  if (!(await hasAdminSession())) {
    redirect('/admin/login');
  }

  return (
    <AppShell
      height="auto"
      variant="surface"
      contentPadding={0}
      mobileNav={false}
      topNav={
        <TopNav
          label={t('pt', 'nav.primary')}
          heading={
            <HStack gap={3} vAlign="center">
              <span className="brand-mark" aria-hidden="true">
                AI
              </span>
              <Text type="label" weight="semibold">
                {t('pt', 'admin.title')}
              </Text>
              <Badge variant="neutral" label={t('pt', 'admin.private')} />
            </HStack>
          }
          endContent={
            <HStack gap={3} vAlign="center">
              <Link href="/" className="admin-link">
                {t('pt', 'admin.backToChat')}
              </Link>
              <form action="/api/admin/logout" method="post">
                <Button type="submit" variant="ghost" size="sm" label={t('pt', 'admin.logout')} />
              </form>
            </HStack>
          }
        />
      }
    >
      <section className="admin-content">
        <VStack gap={8}>
          <VStack gap={2}>
            <Heading level={1} type="display-3">
              {t('pt', 'admin.title')}
            </Heading>
            <Text as="p" color="secondary">
              {t('pt', 'admin.subtitle')}
            </Text>
          </VStack>

          <section className="admin-grid">
            <UploadForm locale="pt" />

            <VStack gap={3}>
              <Card variant="muted" padding={5}>
                <VStack gap={2}>
                  <Heading level={2}>{t('pt', 'admin.securityTitle')}</Heading>
                  <Text as="p" color="secondary">
                    {t('pt', 'admin.securityBody')}
                  </Text>
                </VStack>
              </Card>

              <Card variant="muted" padding={5}>
                <VStack gap={2}>
                  <Heading level={2}>{t('pt', 'admin.flowTitle')}</Heading>
                  <Text as="p" color="secondary">
                    {t('pt', 'admin.flowBody')}
                  </Text>
                </VStack>
              </Card>
            </VStack>
          </section>
        </VStack>
      </section>
    </AppShell>
  );
}

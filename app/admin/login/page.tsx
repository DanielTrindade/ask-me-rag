import Link from 'next/link';
import { AppShell } from '@astryxdesign/core/AppShell';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { TopNav } from '@astryxdesign/core/TopNav';
import { LoginForm } from '@/components/admin/login-form';
import { t } from '@/lib/i18n';

export default function AdminLoginPage() {
  return (
    <AppShell
      height="fill"
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
                {t('pt', 'admin.private')}
              </Text>
            </HStack>
          }
          endContent={
            <Link href="/" className="admin-link">
              {t('pt', 'login.back')}
            </Link>
          }
        />
      }
    >
      <section className="login-content">
        <LoginForm />
      </section>
    </AppShell>
  );
}

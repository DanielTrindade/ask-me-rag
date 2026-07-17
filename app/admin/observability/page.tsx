import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@astryxdesign/core/AppShell';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { TopNav } from '@astryxdesign/core/TopNav';
import { AppBrand } from '@/components/brand/app-brand';
import { ObservabilityMonitor } from '@/components/admin/observability-monitor';
import { hasAdminSession } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

export default async function ObservabilityPage() {
  if (!(await hasAdminSession())) redirect('/admin/login');

  return (
    <AppShell
      height="auto"
      variant="surface"
      contentPadding={0}
      mobileNav={false}
      topNav={
        <TopNav
          label="Navegação administrativa"
          heading={
            <HStack gap={3} vAlign="center">
              <AppBrand kind="mark" priority />
              <Text type="label" weight="semibold">Observabilidade</Text>
              <Badge className="admin-badge" variant="neutral" label="Privado" />
            </HStack>
          }
          endContent={
            <HStack gap={3} vAlign="center">
              <Link href="/admin" className="admin-link">Documentos</Link>
              <Link href="/" className="admin-link">Voltar ao chat</Link>
              <form action="/api/admin/logout" method="post">
                <Button type="submit" variant="ghost" size="sm" label="Sair" />
              </form>
            </HStack>
          }
        />
      }
    >
      <section className="admin-content observability-page">
        <ObservabilityMonitor />
      </section>
    </AppShell>
  );
}

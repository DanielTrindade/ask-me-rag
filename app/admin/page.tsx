import { UploadForm } from '@/components/upload/upload-form';
import { t } from '@/lib/i18n';

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-6 text-xl font-semibold">{t('en', 'admin.title')}</h1>
      <UploadForm />
    </main>
  );
}

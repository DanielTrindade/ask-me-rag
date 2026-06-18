import { UploadForm } from '@/components/upload/upload-form';
import { t } from '@/lib/i18n';
import Link from 'next/link';

export default function AdminPage() {
  const locale = 'pt';

  return (
    <main className="min-h-dvh px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-5xl gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="flex flex-col justify-between rounded-lg border border-white/70 bg-[var(--text)] p-7 text-white shadow-[var(--shadow)]">
          <div>
            <div className="mb-10 inline-flex rounded-md border border-white/15 px-3 py-1 text-xs font-semibold uppercase text-white/62">
              {t(locale, 'admin.kicker')}
            </div>
            <h1 className="max-w-md text-4xl font-semibold leading-none sm:text-5xl">
              {t(locale, 'admin.title')}
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-white/68">{t(locale, 'admin.subtitle')}</p>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-lg border border-white/12 bg-white/[0.06] p-4">
              <div className="text-xs uppercase text-white/45">{t(locale, 'admin.accepts')}</div>
              <div className="mt-2 font-semibold">PDF · Markdown · TXT</div>
            </div>
            <div className="rounded-lg border border-white/12 bg-white/[0.06] p-4">
              <div className="text-xs uppercase text-white/45">{t(locale, 'admin.auth')}</div>
              <div className="mt-2 font-semibold">{t(locale, 'admin.authValue')}</div>
            </div>
            <Link
              href="/"
              className="focus-ring rounded-lg border border-white/12 bg-white/[0.06] p-4 font-semibold text-white transition-[background-color,transform] duration-150 ease-out hover:bg-white/[0.1] active:scale-[0.98]"
            >
              {t(locale, 'admin.backToChat')}
            </Link>
          </div>
        </section>

        <section className="flex items-center rounded-lg border border-white/80 bg-white/74 p-4 shadow-[var(--shadow)] backdrop-blur-xl sm:p-6">
          <UploadForm locale={locale} />
        </section>
      </div>
    </main>
  );
}

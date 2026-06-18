'use client';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { t, type Locale } from '@/lib/i18n';

export function UploadForm({ locale = 'pt' }: { locale?: Locale }) {
  const [password, setPassword] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputId = useId();
  const toast = useToast();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'x-admin-token': password },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'failed');
      toast(t(locale, 'admin.success') + ` (${data.inserted} chunks)`);
      setFile(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : t(locale, 'admin.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <div className="mb-7">
        <div className="text-xs font-semibold uppercase text-[var(--accent-warm)]">
          {t(locale, 'admin.formKicker')}
        </div>
        <h2 className="mt-3 text-3xl font-semibold text-[var(--text)]">
          {t(locale, 'admin.formTitle')}
        </h2>
      </div>

      <div className="grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-[var(--text)]">{t(locale, 'admin.password')}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="focus-ring h-12 rounded-lg border border-[var(--border)] bg-white px-4 text-[15px] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_rgb(31_111_95_/_10%)]"
          />
        </label>

        <input
          id={fileInputId}
          type="file"
          accept=".pdf,.md,.txt"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="sr-only"
        />

        <label
          htmlFor={fileInputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            setFile(e.dataTransfer.files?.[0] ?? null);
          }}
          className={[
            'focus-ring group grid min-h-52 cursor-pointer place-items-center rounded-lg border border-dashed p-6 text-center transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out active:scale-[0.99]',
            dragActive
              ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_0_0_4px_rgb(31_111_95_/_10%)]'
              : 'border-[var(--border)] bg-[var(--surface-strong)] hover:border-[var(--accent)] hover:bg-white',
          ].join(' ')}
        >
          <div>
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-lg bg-white text-xl shadow-sm transition-transform duration-150 ease-out group-hover:-translate-y-0.5">
              ↑
            </div>
            <div className="text-base font-semibold text-[var(--text)]">
              {file ? file.name : t(locale, 'admin.fileTitle')}
            </div>
            <div className="mt-2 text-sm leading-6 text-[var(--muted)]">
              {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : t(locale, 'admin.fileSubtitle')}
            </div>
          </div>
        </label>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" disabled={!file || !password || busy} className="flex-1">
            {busy ? t(locale, 'admin.uploading') : t(locale, 'admin.upload')}
          </Button>
          {file && (
            <Button type="button" variant="secondary" onClick={() => setFile(null)}>
              {t(locale, 'admin.clear')}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

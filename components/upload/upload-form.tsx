'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { t } from '@/lib/i18n';

export function UploadForm() {
  const [password, setPassword] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
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
      toast(t('en', 'admin.success') + ` (${data.inserted} chunks)`);
      setFile(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input
        type="password"
        placeholder={t('en', 'admin.password')}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--accent)]"
      />
      <input
        type="file"
        accept=".pdf,.md,.txt"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-sm"
      />
      <Button type="submit" disabled={!file || !password || busy}>
        {busy ? '…' : t('en', 'admin.upload')}
      </Button>
    </form>
  );
}

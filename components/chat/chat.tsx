'use client';
import { useChat } from '@ai-sdk/react';
import { useState } from 'react';
import { Message } from './message';
import { LocaleToggle } from '@/components/locale-toggle';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { t, type Locale } from '@/lib/i18n';

export function Chat() {
  const [locale, setLocale] = useState<Locale>('pt');
  const [input, setInput] = useState('');
  const toast = useToast();
  const { messages, sendMessage, status } = useChat({
    onError: () => toast(t(locale, 'chat.error')),
  });
  const busy = status === 'submitted' || status === 'streaming';

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col px-4 py-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t(locale, 'app.title')}</h1>
          <p className="text-sm text-[var(--muted)]">{t(locale, 'app.subtitle')}</p>
        </div>
        <LocaleToggle locale={locale} onChange={setLocale} />
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto pb-4">
        {messages.map((m) => (
          <Message key={m.id} role={m.role}>
            {m.parts.map((p, i) => (p.type === 'text' ? <span key={i}>{p.text}</span> : null))}
          </Message>
        ))}
        {busy && messages[messages.length - 1]?.role === 'user' && (
          <div className="self-start text-sm text-[var(--muted)]">{t(locale, 'chat.thinking')}</div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim() || busy) return;
          sendMessage({ text: input });
          setInput('');
        }}
        className="flex gap-2 border-t border-[var(--border)] pt-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t(locale, 'chat.placeholder')}
          className="flex-1 rounded-lg border border-[var(--border)] px-3 py-2 outline-none
                     focus:border-[var(--accent)]"
        />
        <Button type="submit" disabled={busy}>
          {t(locale, 'chat.send')}
        </Button>
      </form>
    </div>
  );
}

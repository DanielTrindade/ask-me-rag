'use client';
import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';
import { Message } from './message';
import { LocaleToggle } from '@/components/locale-toggle';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { t, type Locale } from '@/lib/i18n';

export function Chat() {
  const [locale, setLocale] = useState<Locale>('pt');
  const [input, setInput] = useState('');
  const localeRef = useRef(locale);
  const toast = useToast();
  const { messages, sendMessage, status } = useChat({
    onError: () => toast(t(localeRef.current, 'chat.error')),
  });
  const busy = status === 'submitted' || status === 'streaming';
  const hasMessages = messages.length > 0;

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  const promptSuggestions = [
    t(locale, 'chat.prompt.impact'),
    t(locale, 'chat.prompt.stack'),
    t(locale, 'chat.prompt.profile'),
  ];

  function submitPrompt(value = input) {
    const text = value.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput('');
  }

  return (
    <main className="min-h-dvh px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100dvh-2rem)] w-full max-w-6xl gap-5 lg:grid-cols-[0.82fr_1.18fr]">
        <aside className="hidden flex-col justify-between rounded-lg border border-white/70 bg-[var(--text)] p-8 text-white shadow-[var(--shadow)] lg:flex">
          <div>
            <div className="mb-10 inline-flex rounded-md border border-white/15 px-3 py-1 text-xs font-semibold uppercase text-white/62">
              {t(locale, 'app.kicker')}
            </div>
            <h1 className="max-w-sm text-5xl font-semibold leading-[0.96]">
              {t(locale, 'app.title')}
            </h1>
            <p className="mt-5 max-w-sm text-base leading-7 text-white/68">{t(locale, 'app.subtitle')}</p>
          </div>

          <div className="grid gap-3">
            <div className="rounded-lg border border-white/12 bg-white/[0.06] p-4">
              <div className="text-xs uppercase text-white/45">{t(locale, 'app.knowledge')}</div>
              <div className="mt-2 text-lg font-semibold">PDF · MD · TXT</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-white/12 bg-white/[0.06] p-4">
                <div className="text-xs uppercase text-white/45">{t(locale, 'app.mode')}</div>
                <div className="mt-2 font-semibold">Streaming</div>
              </div>
              <div className="rounded-lg border border-white/12 bg-white/[0.06] p-4">
                <div className="text-xs uppercase text-white/45">{t(locale, 'app.languages')}</div>
                <div className="mt-2 font-semibold">PT / EN</div>
              </div>
            </div>
          </div>
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-white/80 bg-white/72 shadow-[var(--shadow)] backdrop-blur-xl">
          <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-5 sm:px-6">
            <div className="min-w-0">
              <div className="mb-2 text-xs font-semibold uppercase text-[var(--accent-warm)] lg:hidden">
                {t(locale, 'app.kicker')}
              </div>
              <h2 className="truncate text-xl font-semibold text-[var(--text)] sm:text-2xl">
                {t(locale, 'chat.panelTitle')}
              </h2>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{t(locale, 'chat.panelSubtitle')}</p>
            </div>
            <LocaleToggle locale={locale} onChange={setLocale} />
          </header>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-5 sm:px-6">
            {!hasMessages && (
              <div className="my-auto grid gap-5 py-8">
                <div className="max-w-xl">
                  <div className="mb-4 h-1.5 w-16 rounded-full bg-[var(--accent-warm)]" />
                  <h3 className="text-3xl font-semibold leading-tight text-[var(--text)]">
                    {t(locale, 'chat.emptyTitle')}
                  </h3>
                  <p className="mt-3 max-w-lg text-sm leading-6 text-[var(--muted)]">{t(locale, 'chat.emptyBody')}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {promptSuggestions.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setInput(prompt)}
                      className="focus-ring rounded-lg border border-[var(--border)] bg-white/78 p-4 text-left text-sm font-medium leading-5 text-[var(--text)] shadow-sm transition-[border-color,box-shadow,transform] duration-150 ease-out hover:border-[var(--accent)] hover:shadow-md active:scale-[0.98]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <Message key={m.id} role={m.role}>
                {m.parts.reduce((text, p) => (p.type === 'text' ? text + p.text : text), '')}
              </Message>
            ))}
            {busy && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex items-center gap-2 self-start rounded-lg border border-[var(--border)] bg-white/78 px-3 py-2 text-sm text-[var(--muted)] shadow-sm">
                <span>{t(locale, 'chat.thinking')}</span>
                <span className="flex gap-1" aria-hidden="true">
                  <span className="h-1.5 w-1.5 animate-[pulseDot_900ms_ease-in-out_infinite] rounded-full bg-[var(--accent)]" />
                  <span className="h-1.5 w-1.5 animate-[pulseDot_900ms_ease-in-out_120ms_infinite] rounded-full bg-[var(--accent)]" />
                  <span className="h-1.5 w-1.5 animate-[pulseDot_900ms_ease-in-out_240ms_infinite] rounded-full bg-[var(--accent)]" />
                </span>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitPrompt();
            }}
            className="border-t border-[var(--border)] bg-white/76 p-3 sm:p-4"
          >
            <div className="flex items-end gap-2 rounded-lg border border-[var(--border)] bg-white p-2 shadow-sm transition-[border-color,box-shadow] duration-150 focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_4px_rgb(31_111_95_/_10%)]">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submitPrompt();
                  }
                }}
                placeholder={t(locale, 'chat.placeholder')}
                aria-label={t(locale, 'chat.placeholder')}
                disabled={busy}
                rows={1}
                className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-6 text-[var(--text)] outline-none placeholder:text-[var(--muted)] disabled:cursor-not-allowed"
              />
              <Button type="submit" disabled={busy || !input.trim()} className="shrink-0">
                {t(locale, 'chat.send')}
              </Button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

'use client';

import { useChat } from '@ai-sdk/react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { Button } from '@astryxdesign/core/Button';
import {
  ChatComposer,
  ChatComposerInput,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
} from '@astryxdesign/core/Chat';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Icon } from '@astryxdesign/core/Icon';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { HStack } from '@astryxdesign/core/HStack';
import { Kbd } from '@astryxdesign/core/Kbd';
import { Text } from '@astryxdesign/core/Text';
import { TopNav } from '@astryxdesign/core/TopNav';
import { VStack } from '@astryxdesign/core/VStack';
import { useEffect, useRef, useState } from 'react';
import { LocaleToggle } from '@/components/locale-toggle';
import { useToast } from '@/components/ui/toast';
import { pickFollowUps } from '@/lib/follow-ups';
import { t, type Locale } from '@/lib/i18n';
import { Message } from './message';

export function Chat() {
  const [locale, setLocale] = useState<Locale>('pt');
  const [input, setInput] = useState('');
  const [chatError, setChatError] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  const localeRef = useRef(locale);
  const toast = useToast();
  const { messages, sendMessage, regenerate, setMessages, status, stop } = useChat({
    onError: () => {
      setChatError(true);
      toast(t(localeRef.current, 'chat.error'));
    },
  });
  // Balanced density on small screens: the spacious inset costs ~48px of
  // content width per message, which mobile can't spare.
  const isMobile = useMediaQuery('(max-width: 760px)');
  // Enter-to-send only exists on physical keyboards; hide the hint on touch.
  const hasPhysicalPointer = useMediaQuery('(hover: hover) and (pointer: fine)');
  const busy = status === 'submitted' || status === 'streaming';
  const hasMessages = messages.length > 0;
  const lastMessage = messages[messages.length - 1];

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const savedLocale = window.localStorage.getItem('ask-me-locale');
        if (savedLocale === 'pt' || savedLocale === 'en') setLocale(savedLocale);

        const savedMessages = window.sessionStorage.getItem('ask-me-chat');
        if (savedMessages) {
          const restored = JSON.parse(savedMessages) as unknown;
          if (Array.isArray(restored)) setMessages(restored as typeof messages);
        }
      } catch {
        window.sessionStorage.removeItem('ask-me-chat');
      } finally {
        setHasHydrated(true);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [setMessages]);

  useEffect(() => {
    localeRef.current = locale;
    document.documentElement.lang = locale === 'pt' ? 'pt-BR' : 'en';
    if (hasHydrated) window.localStorage.setItem('ask-me-locale', locale);
  }, [hasHydrated, locale]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (messages.length === 0) {
      window.sessionStorage.removeItem('ask-me-chat');
      return;
    }
    window.sessionStorage.setItem('ask-me-chat', JSON.stringify(messages));
  }, [hasHydrated, messages]);

  const promptSuggestions = [
    {
      category: t(locale, 'chat.promptCategory.impact'),
      question: t(locale, 'chat.prompt.impact'),
    },
    {
      category: t(locale, 'chat.promptCategory.stack'),
      question: t(locale, 'chat.prompt.stack'),
    },
    {
      category: t(locale, 'chat.promptCategory.profile'),
      question: t(locale, 'chat.prompt.profile'),
    },
  ];

  const sentQuestions: string[] = [];
  for (const message of messages) {
    if (message.role !== 'user') continue;
    sentQuestions.push(
      message.parts.reduce(
        (text, part) => (part.type === 'text' ? text + part.text : text),
        '',
      ),
    );
  }

  const followUpSuggestions = pickFollowUps(sentQuestions, locale);

  function submitPrompt(value: string) {
    const text = value.trim();
    if (!text || busy) return;
    setChatError(false);
    sendMessage({ text });
    setInput('');
  }

  function startNewConversation() {
    if (busy) stop();
    setMessages([]);
    setInput('');
    setChatError(false);
    window.sessionStorage.removeItem('ask-me-chat');
  }

  function retryLastQuestion() {
    setChatError(false);
    void regenerate();
  }

  const composer = (
    <ChatComposer
      value={input}
      onChange={setInput}
      onSubmit={submitPrompt}
      onStop={stop}
      isStopShown={busy}
      placeholder={t(locale, 'chat.placeholder')}
      density="balanced"
      input={<ChatComposerInput label={t(locale, 'chat.inputLabel')} />}
      status={chatError ? { type: 'error', message: t(locale, 'chat.error') } : undefined}
      sendActions={
        chatError ? (
          <Button
            label={t(locale, 'chat.errorAction')}
            variant="ghost"
            size="sm"
            onClick={retryLastQuestion}
          />
        ) : undefined
      }
      sendButton={
        <Button
          className="localized-chat-send"
          label={t(locale, busy ? 'chat.stop' : 'chat.send')}
          variant={busy ? 'secondary' : 'primary'}
          size="md"
          isIconOnly
          icon={<Icon icon={busy ? 'stop' : 'arrowUp'} />}
          isDisabled={!busy && input.trim().length === 0}
          onClick={busy ? stop : () => submitPrompt(input)}
        />
      }
      footerActions={
        hasPhysicalPointer ? (
          <HStack gap={1} vAlign="center">
            <Kbd keys="enter" />
            <Text type="supporting" color="secondary">
              {t(locale, 'chat.composerShortcut')}
            </Text>
          </HStack>
        ) : undefined
      }
    />
  );

  return (
    <AppShell
      height="fill"
      variant="surface"
      contentPadding={0}
      mobileNav={false}
      topNav={
        <TopNav
          label={t(locale, 'nav.primary')}
          heading={
            <Text type="label" weight="semibold">
              {t(locale, 'app.title')}
            </Text>
          }
          endContent={
            <HStack gap={2} vAlign="center">
              {hasMessages && (
                <Button
                  label={t(locale, 'chat.newConversation')}
                  variant="ghost"
                  size="sm"
                  onClick={startNewConversation}
                />
              )}
              <LocaleToggle locale={locale} onChange={setLocale} />
            </HStack>
          }
        />
      }
    >
      <section className="chat-stage" aria-label={t(locale, 'chat.panelTitle')}>
        {hasMessages ? (
          <ChatLayout
            className="conversation-view"
            composer={composer}
            density={isMobile ? 'balanced' : 'spacious'}
          >
            <ChatMessageList density={isMobile ? 'balanced' : 'spacious'}>
              {messages.map((message, index) => {
                const isLastAssistant =
                  index === messages.length - 1 && message.role === 'assistant';

                return (
                  <Message
                    key={message.id}
                    role={message.role}
                    locale={locale}
                    isStreaming={busy && isLastAssistant}
                    onRetry={
                      isLastAssistant
                        ? () => {
                            setChatError(false);
                            void regenerate({ messageId: message.id });
                          }
                        : undefined
                    }
                  >
                    {message.parts.reduce(
                      (text, part) => (part.type === 'text' ? text + part.text : text),
                      '',
                    )}
                  </Message>
                );
              })}

              {busy && lastMessage?.role === 'user' && (
                <ChatMessage sender="assistant" name={t(locale, 'chat.assistant')}>
                  <ChatMessageBubble className="assistant-message-bubble" variant="ghost">
                    <HStack gap={2} vAlign="center">
                      <span className="thinking-dots" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </span>
                      <Text type="supporting" color="secondary">
                        {t(locale, 'chat.thinking')}
                      </Text>
                    </HStack>
                  </ChatMessageBubble>
                </ChatMessage>
              )}

              {!busy && lastMessage?.role === 'assistant' && followUpSuggestions.length > 0 && (
                <VStack className="chat-followups" as="section" gap={2}>
                  <Text type="supporting" color="secondary" weight="medium">
                    {t(locale, 'chat.followupTitle')}
                  </Text>
                  <HStack gap={2} wrap="wrap">
                    {followUpSuggestions.map((suggestion) => (
                      <Button
                        key={suggestion}
                        className="chat-followup"
                        label={suggestion}
                        size="sm"
                        variant="ghost"
                        onClick={() => submitPrompt(suggestion)}
                      />
                    ))}
                  </HStack>
                </VStack>
              )}
            </ChatMessageList>
          </ChatLayout>
        ) : (
          <section className="recruiter-landing" aria-labelledby="recruiter-chat-title">
            <VStack className="recruiter-shell" as="section" gap={8}>
              <VStack className="recruiter-copy" as="header" gap={3}>
                <Heading
                  id="recruiter-chat-title"
                  className="recruiter-title"
                  level={1}
                  type="display-2"
                  textWrap="balance"
                >
                  {t(locale, 'chat.emptyTitle')}
                </Heading>
                <Text as="p" type="body" color="secondary" textWrap="balance">
                  {t(locale, 'chat.emptyBody')}
                </Text>
              </VStack>

              <VStack
                className="recruiter-composer"
                as="section"
                gap={2}
                aria-label={t(locale, 'chat.composerLabel')}
              >
                {composer}
                <Text as="p" type="supporting" color="secondary">
                  {t(locale, 'chat.composerHint')}
                </Text>
              </VStack>

              <VStack
                className="recruiter-prompts"
                as="section"
                gap={3}
                aria-labelledby="recruiter-prompts-title"
              >
                <Text
                  id="recruiter-prompts-title"
                  as="p"
                  type="supporting"
                  color="secondary"
                  weight="medium"
                >
                  {t(locale, 'chat.suggestions')}
                </Text>
                <Grid
                  className="chat-suggestions"
                  columns={{ minWidth: 220, max: 3, repeat: 'fit' }}
                  gap={2}
                >
                  {promptSuggestions.map((prompt) => (
                    <Button
                      key={prompt.question}
                      className="chat-suggestion"
                      label={prompt.question}
                      variant="ghost"
                      onClick={() => submitPrompt(prompt.question)}
                    >
                      <VStack
                        className="chat-suggestion-content"
                        as="span"
                        gap={1}
                        hAlign="start"
                      >
                        <Text type="supporting" color="secondary" weight="semibold">
                          {prompt.category}
                        </Text>
                        <Text type="body" weight="medium">
                          {prompt.question}
                        </Text>
                      </VStack>
                    </Button>
                  ))}
                </Grid>
              </VStack>
            </VStack>
          </section>
        )}
      </section>
    </AppShell>
  );
}

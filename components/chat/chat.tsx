'use client';

import { useChat } from '@ai-sdk/react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { Button } from '@astryxdesign/core/Button';
import {
  ChatComposer,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
} from '@astryxdesign/core/Chat';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
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
  const localeRef = useRef(locale);
  const toast = useToast();
  const { messages, sendMessage, regenerate, status, stop } = useChat({
    onError: () => toast(t(localeRef.current, 'chat.error')),
  });
  const busy = status === 'submitted' || status === 'streaming';
  const hasMessages = messages.length > 0;
  const lastMessage = messages[messages.length - 1];

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

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
    sendMessage({ text });
    setInput('');
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
      footerActions={
        <HStack gap={1} vAlign="center">
          <Kbd keys="enter" />
          <Text type="supporting" color="secondary">
            {t(locale, 'chat.composerShortcut')}
          </Text>
        </HStack>
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
          endContent={<LocaleToggle locale={locale} onChange={setLocale} />}
        />
      }
    >
      <section className="chat-stage" aria-label={t(locale, 'chat.panelTitle')}>
        {hasMessages ? (
          <ChatLayout className="conversation-view" composer={composer} density="spacious">
            <ChatMessageList density="spacious">
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
                <ChatMessage sender="assistant">
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

'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
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
import { Icon } from '@astryxdesign/core/Icon';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { HStack } from '@astryxdesign/core/HStack';
import { Kbd } from '@astryxdesign/core/Kbd';
import { Text } from '@astryxdesign/core/Text';
import { TopNav } from '@astryxdesign/core/TopNav';
import { VStack } from '@astryxdesign/core/VStack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppBrand } from '@/components/brand/app-brand';
import { LocaleToggle } from '@/components/locale-toggle';
import { useToast } from '@/components/ui/toast';
import type { PortfolioUIMessage } from '@/lib/chat-types';
import {
  CHAT_CONVERSATION_ID_KEY,
  CHAT_SESSION_KEY,
  LOCALE_STORAGE_KEY,
  createChatConversationId,
  parseStoredMessages,
  restoreOrCreateConversationId,
} from '@/lib/chat-session';
import { pickFollowUps } from '@/lib/follow-ups';
import { t, type Locale } from '@/lib/i18n';
import { Message } from './message';
import { RecruiterLanding } from './recruiter-landing';

export function Chat() {
  const [locale, setLocale] = useState<Locale>('pt');
  const [input, setInput] = useState('');
  const [chatError, setChatError] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  const localeRef = useRef(locale);
  const [conversationId, setConversationId] = useState(createChatConversationId);
  const transport = useMemo(
    () =>
      new DefaultChatTransport<PortfolioUIMessage>({
        api: '/api/chat',
        prepareSendMessagesRequest({ messages, body }) {
          return { body: { ...body, conversationId, messages } };
        },
      }),
    [conversationId],
  );
  const toast = useToast();
  const { messages, sendMessage, regenerate, setMessages, status, stop } =
    useChat<PortfolioUIMessage>({
      transport,
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
        const savedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
        if (savedLocale === 'pt' || savedLocale === 'en') setLocale(savedLocale);

        const conversationId = restoreOrCreateConversationId(
          window.sessionStorage.getItem(CHAT_CONVERSATION_ID_KEY),
        );
        setConversationId(conversationId);
        window.sessionStorage.setItem(CHAT_CONVERSATION_ID_KEY, conversationId);

        const savedMessages = window.sessionStorage.getItem(CHAT_SESSION_KEY);
        if (savedMessages) {
          const restored = parseStoredMessages(savedMessages);
          if (restored) setMessages(restored);
          else window.sessionStorage.removeItem(CHAT_SESSION_KEY);
        }
      } catch {
        window.sessionStorage.removeItem(CHAT_SESSION_KEY);
      } finally {
        setHasHydrated(true);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [setMessages]);

  useEffect(() => {
    if (!hasHydrated) return;
    try {
      window.sessionStorage.setItem(CHAT_CONVERSATION_ID_KEY, conversationId);
    } catch {
      // Storage can be unavailable in privacy-restricted contexts.
    }
  }, [conversationId, hasHydrated]);

  useEffect(() => {
    localeRef.current = locale;
    document.documentElement.lang = locale === 'pt' ? 'pt-BR' : 'en';
    if (hasHydrated) {
      try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
      } catch {
        // Storage can be unavailable in privacy-restricted contexts.
      }
    }
  }, [hasHydrated, locale]);

  useEffect(() => {
    if (!hasHydrated || busy) return;
    if (messages.length === 0) {
      window.sessionStorage.removeItem(CHAT_SESSION_KEY);
      return;
    }

    const timer = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(CHAT_SESSION_KEY, JSON.stringify(messages));
      } catch {
        // Keep the chat usable if the browser storage quota is exhausted.
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [busy, hasHydrated, messages]);

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
    const conversationId = createChatConversationId();
    setConversationId(conversationId);
    try {
      window.sessionStorage.removeItem(CHAT_SESSION_KEY);
      window.sessionStorage.setItem(CHAT_CONVERSATION_ID_KEY, conversationId);
    } catch {
      // The in-memory identifier remains valid for this page lifetime.
    }
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
          heading={<AppBrand priority />}
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
          <RecruiterLanding
            locale={locale}
            composer={composer}
            onSubmitPrompt={submitPrompt}
          />
        )}
      </section>
    </AppShell>
  );
}

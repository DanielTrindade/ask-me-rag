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
import { Text } from '@astryxdesign/core/Text';
import { TopNav } from '@astryxdesign/core/TopNav';
import { VStack } from '@astryxdesign/core/VStack';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { AppBrand } from '@/components/brand/app-brand';
import { LocaleToggle } from '@/components/locale-toggle';
import { useToast } from '@/components/ui/toast';
import {
  isPublicChatStatus,
  parsePublicChatStatusMessage,
  publicChatFetch,
  PublicChatRequestError,
  type PortfolioUIMessage,
  type PublicChatStatus,
  type PublicChatStatusKind,
} from '@/lib/chat-types';
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
import { ProfileActions } from './profile-actions';
import { RecruiterLanding } from './recruiter-landing';

function publicStatusMessage(locale: Locale, kind: PublicChatStatusKind) {
  if (kind === 'temporarily_limited') return t(locale, 'chat.degraded.limited');
  if (kind === 'disabled') return t(locale, 'chat.degraded.disabled');
  if (kind === 'conversation_busy') return t(locale, 'chat.degraded.busy');
  if (kind === 'partial') return t(locale, 'chat.degraded.partial');
  if (kind === 'cache_hit') return t(locale, 'chat.degraded.cacheHit');
  if (kind === 'deterministic_fallback') return t(locale, 'chat.degraded.fallback');
  return t(locale, 'chat.degraded.unavailable');
}

function messagePublicStatus(message: PortfolioUIMessage): PublicChatStatus | null {
  for (const part of message.parts) {
    if (part.type === 'data-chat-status' && isPublicChatStatus(part.data)) {
      return part.data;
    }
  }
  return null;
}

interface ChatViewProps {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  hasMessages: boolean;
  onNewConversation: () => void;
  composer: ReactNode;
  isMobile: boolean;
  messages: PortfolioUIMessage[];
  busy: boolean;
  lastMessage: PortfolioUIMessage | undefined;
  publicStatus: PublicChatStatus | null;
  onRetry: (messageId: string) => void;
  followUpSuggestions: string[];
  onSubmitPrompt: (prompt: string) => void;
}

function ChatView({
  locale,
  onLocaleChange,
  hasMessages,
  onNewConversation,
  composer,
  isMobile,
  messages,
  busy,
  lastMessage,
  publicStatus,
  onRetry,
  followUpSuggestions,
  onSubmitPrompt,
}: ChatViewProps) {
  return (
    <AppShell
      height="fill"
      variant="surface"
      contentPadding={0}
      mobileNav={false}
      topNav={
        <TopNav
          label={t(locale, 'nav.primary')}
          heading={<AppBrand />}
          endContent={
            <HStack gap={2} vAlign="center">
              {hasMessages && (
                <Button
                  label={t(locale, 'chat.newConversation')}
                  variant="ghost"
                  size="sm"
                  onClick={onNewConversation}
                />
              )}
              <LocaleToggle locale={locale} onChange={onLocaleChange} />
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
                const streamedStatus = messagePublicStatus(message);
                const effectiveStatus = streamedStatus ?? (
                  isLastAssistant && publicStatus?.kind === 'partial'
                    ? publicStatus
                    : null
                );

                return (
                  <Message
                    key={message.id}
                    role={message.role}
                    locale={locale}
                    isStreaming={busy && isLastAssistant}
                    status={effectiveStatus}
                    onRetry={
                      isLastAssistant && effectiveStatus?.retryable
                        ? () => onRetry(message.id)
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
                  <ChatMessageBubble
                    className="assistant-message-bubble is-streaming"
                    variant="ghost"
                  >
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

              {!busy && publicStatus && lastMessage?.role === 'user' && (
                <VStack
                  className="chat-degraded-state"
                  as="section"
                  gap={3}
                  role="status"
                  aria-live="polite"
                >
                  <Text type="body">
                    {publicStatusMessage(locale, publicStatus.kind)}
                  </Text>
                  <ProfileActions locale={locale} />
                </VStack>
              )}

              {!busy && !publicStatus && lastMessage?.role === 'assistant' && followUpSuggestions.length > 0 && (
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
                        onClick={() => onSubmitPrompt(suggestion)}
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
            onSubmitPrompt={onSubmitPrompt}
          />
        )}
      </section>
    </AppShell>
  );
}

export function Chat() {
  const [locale, setLocale] = useState<Locale>('pt');
  const [input, setInput] = useState('');
  const [publicStatus, setPublicStatus] = useState<PublicChatStatus | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const submitLockRef = useRef(false);
  const [conversationId, setConversationId] = useState(createChatConversationId);
  const transport = useMemo(
    () =>
      new DefaultChatTransport<PortfolioUIMessage>({
        api: '/api/chat',
        fetch: publicChatFetch,
        headers: () => ({
          'accept-language': locale === 'pt' ? 'pt-BR' : 'en',
        }),
        prepareSendMessagesRequest({ messages, body }) {
          return { body: { ...body, conversationId, messages } };
        },
      }),
    [conversationId, locale],
  );
  const toast = useToast();
  const { messages, sendMessage, regenerate, setMessages, status, stop } =
    useChat<PortfolioUIMessage>({
      transport,
      onError: (error) => {
        const nextStatus = error instanceof PublicChatRequestError
          ? {
              kind: error.failure.error,
              retryable: error.failure.retryable,
              resetAt: error.failure.resetAt,
            } satisfies PublicChatStatus
          : parsePublicChatStatusMessage(error.message) ?? {
              kind: 'temporarily_unavailable',
              retryable: true,
            } satisfies PublicChatStatus;
        setPublicStatus(nextStatus);
        toast(publicStatusMessage(locale, nextStatus.kind));
      },
      onFinish: ({ message, isAbort }) => {
        if (!isAbort) return;
        const text = message.parts.reduce(
          (value, part) => (part.type === 'text' ? value + part.text : value),
          '',
        );
        if (text.trim()) setPublicStatus({ kind: 'partial', retryable: false });
      },
    });
  // Balanced density on small screens: the spacious inset costs ~48px of
  // content width per message, which mobile can't spare.
  const isMobile = useMediaQuery('(max-width: 760px)');
  const busy = status === 'submitted' || status === 'streaming';
  const hasMessages = messages.length > 0;
  const lastMessage = messages[messages.length - 1];

  useEffect(() => {
    if (!busy) submitLockRef.current = false;
  }, [busy]);

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
    if (!text || busy || submitLockRef.current) return;
    submitLockRef.current = true;
    setPublicStatus(null);
    setInput('');
    void sendMessage({ text }).finally(() => {
      submitLockRef.current = false;
    });
  }

  function startNewConversation() {
    if (busy) stop();
    setMessages([]);
    setInput('');
    setPublicStatus(null);
    submitLockRef.current = false;
    const conversationId = createChatConversationId();
    setConversationId(conversationId);
    try {
      window.sessionStorage.removeItem(CHAT_SESSION_KEY);
      window.sessionStorage.setItem(CHAT_CONVERSATION_ID_KEY, conversationId);
    } catch {
      // The in-memory identifier remains valid for this page lifetime.
    }
  }

  function retryLastQuestion(messageId?: string) {
    if (busy || !publicStatus?.retryable) return;
    setPublicStatus(null);
    void regenerate(messageId ? { messageId } : undefined);
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
      isDisabled={busy}
      input={<ChatComposerInput label={t(locale, 'chat.inputLabel')} />}
      status={publicStatus ? {
        type: 'error',
        message: publicStatusMessage(locale, publicStatus.kind),
      } : undefined}
      sendActions={
        publicStatus?.retryable ? (
          <Button
            label={t(locale, 'chat.errorAction')}
            variant="ghost"
            size="sm"
            onClick={() => retryLastQuestion()}
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
    />
  );

  return (
    <ChatView
      locale={locale}
      onLocaleChange={setLocale}
      hasMessages={hasMessages}
      onNewConversation={startNewConversation}
      composer={composer}
      isMobile={isMobile}
      messages={messages}
      busy={busy}
      lastMessage={lastMessage}
      publicStatus={publicStatus}
      onRetry={retryLastQuestion}
      followUpSuggestions={followUpSuggestions}
      onSubmitPrompt={submitPrompt}
    />
  );
}

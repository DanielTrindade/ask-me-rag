'use client';

import { Button } from '@astryxdesign/core/Button';
import {
  ChatMessage,
  ChatMessageBubble,
  ChatMessageMetadata,
} from '@astryxdesign/core/Chat';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { memo } from 'react';
import { AssistantMarkdown } from '@/components/chat/assistant-markdown';
import { ProfileActions } from '@/components/chat/profile-actions';
import type { PublicChatStatus } from '@/lib/chat-types';
import { t, type Locale } from '@/lib/i18n';

type MessageProps = {
  role: string;
  children: string;
  locale: Locale;
  isStreaming?: boolean;
  status?: PublicChatStatus | null;
  onRetry?: () => void;
};

export const Message = memo(function Message({
  role,
  children,
  locale,
  isStreaming = false,
  status,
  onRetry,
}: MessageProps) {
  const isUser = role === 'user';

  const metadata =
    !isUser && !isStreaming && onRetry ? (
      <ChatMessageMetadata
        footer={
          <HStack gap={1} vAlign="center" wrap="wrap">
            <Button
              label={t(locale, 'chat.retry')}
              variant="ghost"
              size="sm"
              onClick={onRetry}
            />
          </HStack>
        }
      />
    ) : undefined;

  return (
    <ChatMessage
      sender={isUser ? 'user' : 'assistant'}
      name={t(locale, isUser ? 'chat.you' : 'chat.assistant')}
    >
      <ChatMessageBubble
        // The margin rule that marks assistant answers is drawn on this bubble:
        // `is-streaming` keeps it growing downward until the response lands.
        className={
          isUser
            ? 'user-message-bubble'
            : `assistant-message-bubble${isStreaming ? ' is-streaming' : ''}`
        }
        variant={isUser ? 'filled' : 'ghost'}
        metadata={metadata}
      >
        {isUser ? (
          <Text as="p" type="body" className="message-copy">
            {children}
          </Text>
        ) : (
          <AssistantMarkdown isStreaming={isStreaming}>
            {children}
          </AssistantMarkdown>
        )}
        {!isUser && status && (
          <VStack
            className="chat-message-status"
            gap={2}
            role="status"
            aria-live="polite"
          >
            <Text type="supporting" color="secondary">
              {status.kind === 'partial'
                ? t(locale, 'chat.degraded.partial')
                : status.kind === 'cache_hit'
                  ? t(locale, 'chat.degraded.cacheHit')
                  : t(locale, 'chat.degraded.fallback')}
            </Text>
            {(status.kind === 'partial' || status.kind === 'deterministic_fallback') && (
              <ProfileActions locale={locale} />
            )}
          </VStack>
        )}
      </ChatMessageBubble>
    </ChatMessage>
  );
});

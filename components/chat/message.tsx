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

// The margin rule that marks assistant answers is drawn on the bubble:
// `is-streaming` keeps it growing downward until the response lands.
function getBubbleClassName(isUser: boolean, isStreaming: boolean) {
  return isUser
    ? 'user-message-bubble'
    : `assistant-message-bubble${isStreaming ? ' is-streaming' : ''}`;
}

function getStatusText(status: PublicChatStatus, locale: Locale) {
  if (status.kind === 'partial') {
    return t(locale, 'chat.degraded.partial');
  }
  if (status.kind === 'cache_hit') {
    return t(locale, 'chat.degraded.cacheHit');
  }
  return t(locale, 'chat.degraded.fallback');
}

function RetryFooter({
  locale,
  onRetry,
}: {
  locale: Locale;
  onRetry: () => void;
}) {
  return (
    <HStack gap={1} vAlign="center" wrap="wrap">
      <Button
        label={t(locale, 'chat.retry')}
        variant="ghost"
        size="sm"
        onClick={onRetry}
      />
    </HStack>
  );
}

function MessageStatusPanel({
  status,
  locale,
}: {
  status: PublicChatStatus;
  locale: Locale;
}) {
  const showProfileActions =
    status.kind === 'partial' || status.kind === 'deterministic_fallback';

  return (
    <VStack
      className="chat-message-status"
      gap={2}
      role="status"
      aria-live="polite"
    >
      <Text type="supporting" color="secondary">
        {getStatusText(status, locale)}
      </Text>
      {showProfileActions && <ProfileActions locale={locale} />}
    </VStack>
  );
}

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
        footer={<RetryFooter locale={locale} onRetry={onRetry} />}
      />
    ) : undefined;

  return (
    <ChatMessage
      sender={isUser ? 'user' : 'assistant'}
      name={t(locale, isUser ? 'chat.you' : 'chat.assistant')}
    >
      <ChatMessageBubble
        className={getBubbleClassName(isUser, isStreaming)}
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
          <MessageStatusPanel status={status} locale={locale} />
        )}
      </ChatMessageBubble>
    </ChatMessage>
  );
});

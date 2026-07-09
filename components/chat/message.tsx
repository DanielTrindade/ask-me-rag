'use client';

import { Button } from '@astryxdesign/core/Button';
import {
  ChatMessage,
  ChatMessageBubble,
  ChatMessageMetadata,
} from '@astryxdesign/core/Chat';
import { HStack } from '@astryxdesign/core/HStack';
import { Markdown } from '@astryxdesign/core/Markdown';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { useEffect, useRef, useState } from 'react';
import { t, type Locale } from '@/lib/i18n';

type MessageProps = {
  role: string;
  children: string;
  locale: Locale;
  isStreaming?: boolean;
  onRetry?: () => void;
};

export function Message({
  role,
  children,
  locale,
  isStreaming = false,
  onRetry,
}: MessageProps) {
  const isUser = role === 'user';
  const [copied, setCopied] = useState(false);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    };
  }, []);

  async function copyResponse() {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
      copyResetTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const metadata =
    !isUser && !isStreaming ? (
      <ChatMessageMetadata
        footer={
          <HStack gap={1} vAlign="center" wrap="wrap">
            <Tooltip content={t(locale, 'chat.sourceTooltip')} placement="below">
              <Token
                label={t(locale, 'chat.sourceLabel')}
                description={t(locale, 'chat.sourceTooltip')}
                size="sm"
                color="gray"
              />
            </Tooltip>
            <Button
              className={copied ? 'copy-swap' : undefined}
              label={copied ? t(locale, 'chat.copied') : t(locale, 'chat.copy')}
              variant="ghost"
              size="sm"
              onClick={() => {
                void copyResponse();
              }}
            />
            {onRetry && (
              <Button
                label={t(locale, 'chat.retry')}
                variant="ghost"
                size="sm"
                onClick={onRetry}
              />
            )}
          </HStack>
        }
      />
    ) : undefined;

  return (
    <ChatMessage sender={isUser ? 'user' : 'assistant'}>
      <ChatMessageBubble
        className={isUser ? 'user-message-bubble' : 'assistant-message-bubble'}
        variant={isUser ? 'filled' : 'ghost'}
        metadata={metadata}
      >
        {isUser ? (
          <Text as="p" type="body" className="message-copy">
            {children}
          </Text>
        ) : (
          <Markdown
            className="assistant-markdown"
            density="default"
            headingLevelStart={2}
            isStreaming={isStreaming}
            contentWidth="100%"
            autolink="gfm"
          >
            {children}
          </Markdown>
        )}
      </ChatMessageBubble>
    </ChatMessage>
  );
}

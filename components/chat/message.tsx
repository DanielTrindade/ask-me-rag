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
import { memo, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import type { SourceReference } from '@/lib/chat-types';
import { t, type Locale } from '@/lib/i18n';

type MessageProps = {
  role: string;
  children: string;
  locale: Locale;
  sources?: SourceReference[];
  isStreaming?: boolean;
  onRetry?: () => void;
};

export const Message = memo(function Message({
  role,
  children,
  locale,
  sources = [],
  isStreaming = false,
  onRetry,
}: MessageProps) {
  const isUser = role === 'user';
  const [copied, setCopied] = useState(false);
  const toast = useToast();
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
      toast(t(locale, 'chat.copyError'));
    }
  }

  const metadata =
    !isUser && !isStreaming ? (
      <ChatMessageMetadata
        footer={
          <HStack gap={1} vAlign="center" wrap="wrap">
            {sources.length > 0 && (
              <details className="message-sources">
                <summary>
                  {t(locale, 'chat.sourcesUsed')} · {sources.length}
                </summary>
                <ul>
                  {sources.map((source) => (
                    <li key={source.name}>
                      <span>{source.name}</span>
                      <span>
                        {source.matchedChunks}{' '}
                        {t(
                          locale,
                          source.matchedChunks === 1
                            ? 'chat.sourceChunk'
                            : 'chat.sourceChunks',
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
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
    <ChatMessage
      sender={isUser ? 'user' : 'assistant'}
      name={t(locale, isUser ? 'chat.you' : 'chat.assistant')}
    >
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
});

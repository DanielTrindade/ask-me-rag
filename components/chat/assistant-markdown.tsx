'use client';

import {
  Markdown,
  type MarkdownInlinePlugin,
} from '@astryxdesign/core/Markdown';

const htmlLineBreakPlugin: MarkdownInlinePlugin = {
  pattern: /<br\s*\/?>/gi,
  render: (_match, key) => <br key={key} />,
};

const assistantMarkdownPlugins = [htmlLineBreakPlugin];

export function AssistantMarkdown({
  children,
  isStreaming = false,
}: {
  children: string;
  isStreaming?: boolean;
}) {
  return (
    <Markdown
      className="assistant-markdown"
      density="default"
      headingLevelStart={2}
      isStreaming={isStreaming}
      contentWidth="100%"
      autolink="gfm"
      inlinePlugins={assistantMarkdownPlugins}
    >
      {children}
    </Markdown>
  );
}

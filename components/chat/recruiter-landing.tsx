'use client';

import { Button } from '@astryxdesign/core/Button';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { type MouseEvent, type ReactNode, type UIEvent, useRef, useState } from 'react';
import { ProfileActions } from '@/components/chat/profile-actions';
import { t, type Locale } from '@/lib/i18n';

type RecruiterLandingProps = {
  locale: Locale;
  composer: ReactNode;
  isMobile: boolean;
  onSubmitPrompt: (prompt: string) => void;
};

type PromptSuggestion = {
  category: string;
  question: string;
};

type PromptButtonProps = {
  prompt: PromptSuggestion;
  onSubmitPrompt: (prompt: string) => void;
};

function PromptButton({ prompt, onSubmitPrompt }: PromptButtonProps) {
  return (
    <Button
      className="chat-suggestion"
      label={prompt.question}
      variant="ghost"
      onClick={() => onSubmitPrompt(prompt.question)}
    >
      <VStack
        className="chat-suggestion-content"
        as="span"
        gap={1}
        hAlign="start"
      >
        <Text
          className="chat-suggestion-category"
          type="supporting"
          color="secondary"
          weight="semibold"
        >
          {prompt.category}
        </Text>
        <Text type="body" weight="medium">
          {prompt.question}
        </Text>
      </VStack>
    </Button>
  );
}

type PromptDeckProps = {
  locale: Locale;
  prompts: PromptSuggestion[];
  onSubmitPrompt: (prompt: string) => void;
};

function PromptDeck({ locale, prompts, onSubmitPrompt }: PromptDeckProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activePrompt, setActivePrompt] = useState(0);

  function updateActivePrompt(event: UIEvent<HTMLDivElement>) {
    const track = event.currentTarget;
    const slides = Array.from(track.children) as HTMLElement[];
    let nextPrompt = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    slides.forEach((slide, index) => {
      const distance = Math.abs(slide.offsetLeft - track.scrollLeft);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nextPrompt = index;
      }
    });

    setActivePrompt(nextPrompt);
  }

  function showPrompt(index: number, event: MouseEvent<HTMLButtonElement>) {
    const track = trackRef.current;
    const slide = track?.children.item(index) as HTMLElement | null;
    if (!track || !slide) return;

    const shouldReduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    track.scrollTo({
      left: slide.offsetLeft,
      behavior: event.detail === 0 || shouldReduceMotion ? 'auto' : 'smooth',
    });
    setActivePrompt(index);
  }

  return (
    <div className="chat-suggestion-deck">
      <HStack className="chat-suggestion-deck-header" gap={3} vAlign="center">
        <Text type="supporting" color="secondary" weight="medium">
          {t(locale, 'chat.suggestionsLabel')}
        </Text>
        <Text
          className="chat-suggestion-position"
          as="span"
          type="supporting"
          color="secondary"
          aria-live="polite"
        >
          {activePrompt + 1} / {prompts.length}
        </Text>
      </HStack>

      <div
        ref={trackRef}
        className="chat-suggestion-track"
        onScroll={updateActivePrompt}
      >
        {prompts.map((prompt, index) => (
          <div
            key={prompt.question}
            className="chat-suggestion-slide"
            role="group"
            aria-label={`${index + 1} / ${prompts.length}`}
          >
            <PromptButton prompt={prompt} onSubmitPrompt={onSubmitPrompt} />
          </div>
        ))}
      </div>

      <div className="chat-suggestion-pagination">
        {prompts.map((prompt, index) => (
          <button
            key={prompt.question}
            className="chat-suggestion-dot"
            type="button"
            aria-label={`${t(locale, 'chat.showSuggestion')} ${index + 1}: ${prompt.question}`}
            aria-current={activePrompt === index ? 'true' : undefined}
            onClick={(event) => showPrompt(index, event)}
          />
        ))}
      </div>
    </div>
  );
}

export function RecruiterLanding({
  locale,
  composer,
  isMobile,
  onSubmitPrompt,
}: RecruiterLandingProps) {
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

  const promptSection = (
    <VStack
      className="recruiter-prompts"
      as="section"
      gap={3}
      aria-label={t(locale, 'chat.suggestionsLabel')}
    >
      {isMobile ? (
        <PromptDeck
          locale={locale}
          prompts={promptSuggestions}
          onSubmitPrompt={onSubmitPrompt}
        />
      ) : (
        <Grid
          className="chat-suggestions"
          columns={{ minWidth: 220, max: 3, repeat: 'fit' }}
          gap={2}
        >
          {promptSuggestions.map((prompt) => (
            <PromptButton
              key={prompt.question}
              prompt={prompt}
              onSubmitPrompt={onSubmitPrompt}
            />
          ))}
        </Grid>
      )}
    </VStack>
  );

  return (
    <section className="recruiter-landing" aria-labelledby="recruiter-chat-title">
      <VStack className="recruiter-shell" as="section" gap={8}>
        <VStack className="recruiter-copy" as="header" gap={4}>
          <Heading
            id="recruiter-chat-title"
            className="recruiter-title"
            level={1}
            type="display-2"
            textWrap="balance"
          >
            {t(locale, 'chat.emptyTitle')}
          </Heading>
          <Text
            className="recruiter-lede"
            as="p"
            type="body"
            color="secondary"
            textWrap="pretty"
          >
            {t(locale, 'chat.emptyBody')}
          </Text>
          <ProfileActions locale={locale} />
        </VStack>

        {isMobile && promptSection}

        <VStack
          className="recruiter-composer"
          as="section"
          gap={2}
          aria-label={t(locale, 'chat.composerLabel')}
        >
          {composer}
        </VStack>

        {!isMobile && promptSection}

        <Text className="chat-telemetry-notice" as="p" type="supporting" color="secondary">
          {t(locale, 'chat.telemetryNotice')}
        </Text>
      </VStack>
    </section>
  );
}

import { Button } from '@astryxdesign/core/Button';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import type { ReactNode } from 'react';
import { ProfileActions } from '@/components/chat/profile-actions';
import { t, type Locale } from '@/lib/i18n';

type RecruiterLandingProps = {
  locale: Locale;
  composer: ReactNode;
  onSubmitPrompt: (prompt: string) => void;
};

export function RecruiterLanding({
  locale,
  composer,
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

  return (
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
          <ProfileActions locale={locale} />
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
          <Text className="chat-telemetry-notice" as="p" type="supporting" color="secondary">
            {t(locale, 'chat.telemetryNotice')}
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
                onClick={() => onSubmitPrompt(prompt.question)}
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
  );
}

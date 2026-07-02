import { t, type Locale } from '@/lib/i18n';

/** Curated follow-up questions; every one has a good answer in the indexed documents. */
export const FOLLOW_UP_POOL_KEYS = [
  'chat.followup.recentProject',
  'chat.followup.fullStack',
  'chat.followup.decisions',
  'chat.followup.challenge',
  'chat.followup.collaboration',
  'chat.followup.quality',
  'chat.followup.growth',
  'chat.followup.data',
];

/**
 * Picks the next follow-up suggestions, skipping any question already sent
 * as a user message (clicked or typed). Matching happens in both locales so
 * switching languages mid-chat does not resurface a used suggestion.
 */
export function pickFollowUps(
  sentQuestions: Iterable<string>,
  locale: Locale,
  count = 2,
): string[] {
  const sent = new Set([...sentQuestions].map((question) => question.trim()));

  return FOLLOW_UP_POOL_KEYS.filter(
    (key) => !sent.has(t('pt', key)) && !sent.has(t('en', key)),
  )
    .slice(0, count)
    .map((key) => t(locale, key));
}

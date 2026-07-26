import type { Locale } from '@/lib/i18n';

const CONTACT_PATTERN =
  /\b(github|linkedin|curr[ií]culo|curriculum|resume|résumé|cv|contato|contact|falar com|reach(?:\s+out)?)\b/i;

const ANSWERS: Record<Locale, string> = {
  pt: 'Você pode acessar meus links profissionais públicos abaixo. Os canais aparecem somente quando estão configurados para este portfólio.',
  en: 'You can use the public professional links below. A channel is shown only when it is configured for this portfolio.',
};

export function findDeterministicFaqAnswer(question: string, locale: Locale): string | null {
  return CONTACT_PATTERN.test(question.normalize('NFC')) ? ANSWERS[locale] : null;
}

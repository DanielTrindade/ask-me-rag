import type { Locale } from '@/lib/i18n';

const CONTACT_PATTERN = /^(?:onde\s+(?:encontro|vejo|acesso)\s+(?:o\s+)?(?:meu|seu)\s+(?:curr[ií]culo|curriculum|resume|résumé|cv|github|linkedin)|onde\s+(?:encontro|vejo|acesso)\s+(?:curr[ií]culo|curriculum|resume|résumé|cv|github|linkedin)|qual\s+[ée]\s+o\s+seu\s+(?:github|linkedin|curr[ií]culo|curriculum|resume|résumé|cv)|(?:can\s+i\s+see|where\s+can\s+i\s+find)\s+(?:your\s+)?(?:github|linkedin|resume|résumé|cv)|how\s+can\s+i\s+reach\s+out(?:\s+to\s+you)?|(?:como|onde)\s+posso\s+(?:entrar\s+em\s+contato|falar\s+com)\s+voc[eê])\s*[?!.,]*$/iu;

const ANSWERS: Record<Locale, string> = {
  pt: 'Você pode acessar meus links profissionais públicos abaixo. Os canais aparecem somente quando estão configurados para este portfólio.',
  en: 'You can use the public professional links below. A channel is shown only when it is configured for this portfolio.',
};

export function findDeterministicFaqAnswer(question: string, locale: Locale): string | null {
  return CONTACT_PATTERN.test(question.normalize('NFC').trim()) ? ANSWERS[locale] : null;
}

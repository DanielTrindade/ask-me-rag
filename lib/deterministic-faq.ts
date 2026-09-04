import { t, type Locale } from '@/lib/i18n';

const PROFILE_LINK = /(?:curr[ií]culo|curriculum|resume|résumé|cv|github|linkedin)/.source;
const TRAILING_PUNCTUATION = /\s*[?!.,]*/.source;

/**
 * Cada padrão descreve um pedido de link público inteiro. A âncora aplicada em
 * CONTACT_PATTERN garante que um pedido misto ("Qual seu LinkedIn? E o Dijkstra?")
 * nunca seja interceptado antes do guarda de escopo.
 */
const CONTACT_REQUESTS = [
  // pt — "Onde encontro (o) (seu) currículo"
  /(?:onde|como)\s+(?:encontro|vejo|acesso)\s+(?:o\s+)?(?:(?:seu|meu)\s+)?/.source + PROFILE_LINK,
  // pt — "Qual (é) (o) seu LinkedIn"
  /qual\s+(?:[ée]\s+)?(?:o\s+)?seu\s+/.source + PROFILE_LINK,
  // pt — "Como posso entrar em contato (com você)" / "Como posso falar com você"
  /(?:como|onde)\s+posso\s+(?:entrar\s+em\s+contato(?:\s+com\s+voc[eê])?|falar\s+com\s+voc[eê])/.source,
  // en — "Can I see your GitHub" / "Where can I find your resume"
  /(?:can\s+i\s+see|where\s+can\s+i\s+find)\s+(?:your\s+)?/.source + PROFILE_LINK,
  // en — "How can I reach out (to you)"
  /how\s+can\s+i\s+reach\s+out(?:\s+to\s+you)?/.source,
];

const CONTACT_PATTERN = new RegExp(
  '^(?:' + CONTACT_REQUESTS.join('|') + ')' + TRAILING_PUNCTUATION + '$',
  'iu',
);

const GITHUB_FALLBACK_URL = 'https://github.com/DanielTrindade';

type ProfileLink = {
  label: string;
  url: string;
};

function resolveProfileLinks(locale: Locale): ProfileLink[] {
  const links: ProfileLink[] = [];
  const github = process.env.NEXT_PUBLIC_GITHUB_URL?.trim() || GITHUB_FALLBACK_URL;
  links.push({ label: t(locale, 'profile.github'), url: github });
  const linkedin = process.env.NEXT_PUBLIC_LINKEDIN_URL?.trim();
  if (linkedin) links.push({ label: t(locale, 'profile.linkedin'), url: linkedin });
  const resume = process.env.NEXT_PUBLIC_RESUME_URL?.trim();
  if (resume) links.push({ label: t(locale, 'profile.resume'), url: resume });
  return links;
}

function formatProfileLinks(links: ProfileLink[]) {
  return links.map(({ label, url }) => `[${label}](${url})`).join(' · ');
}

const ANSWERS: Record<Locale, (links: string) => string> = {
  pt: (links) =>
    `Você pode acessar meus links profissionais públicos: ${links}. Os demais canais aparecem quando estão configurados para este portfólio.`,
  en: (links) =>
    `You can reach my public professional links: ${links}. Other channels appear only when they are configured for this portfolio.`,
};

export function findDeterministicFaqAnswer(question: string, locale: Locale): string | null {
  if (!CONTACT_PATTERN.test(question.normalize('NFC').trim())) return null;
  const links = formatProfileLinks(resolveProfileLinks(locale));
  return ANSWERS[locale](links);
}
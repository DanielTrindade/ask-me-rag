import type { Locale } from '@/lib/i18n';

const PORTUGUESE_MARKERS = new Set([
  'qual', 'quais', 'como', 'onde', 'quando', 'quem', 'porque',
  'voce', 'seu', 'sua', 'seus', 'suas', 'meu', 'minha',
  'teve', 'tem', 'foi', 'trabalhou', 'utiliza', 'utilizou', 'possui',
  'descreva', 'resuma', 'fale', 'conte', 'atuou', 'participa', 'posso',
  'responsabilidade', 'responsabilidades', 'experiencia', 'experiencias',
  'projeto', 'projetos', 'recente', 'carreira', 'trajetoria', 'formacao',
  'habilidade', 'habilidades', 'competencia', 'competencias',
  'desenvolvimento', 'banco', 'bancos', 'dados', 'inteligencia', 'artificial',
  'ingles', 'nivel', 'area', 'areas', 'interesse', 'interesses', 'profissional',
  'impacto', 'resultado', 'resultados', 'tecnologia', 'tecnologias', 'mais',
  'contato', 'curriculo',
]);

const ENGLISH_MARKERS = new Set([
  'what', 'which', 'how', 'where', 'when', 'who', 'why',
  'you', 'your', 'yours', 'did', 'does', 'were', 'are', 'have', 'has',
  'tell', 'describe', 'summarize', 'worked', 'use', 'used', 'can', 'find', 'see',
  'responsibility', 'responsibilities', 'experience', 'experiences',
  'project', 'projects', 'latest', 'recent', 'career', 'background', 'education',
  'skill', 'skills', 'competency', 'competencies', 'development',
  'database', 'databases', 'data', 'artificial', 'intelligence', 'english',
  'level', 'area', 'areas', 'interest', 'interests', 'professional',
  'impact', 'result', 'results', 'technology', 'technologies', 'most',
  'contact', 'resume', 'curriculum',
]);

function normalizedWords(question: string) {
  return question
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('und')
    .match(/\p{L}+/gu) ?? [];
}

function score(words: string[], markers: ReadonlySet<string>) {
  return words.reduce((total, word) => total + Number(markers.has(word)), 0);
}

/**
 * Resolve o idioma da pergunta sem custo de rede. Termos técnicos ou entradas
 * sem sinal linguístico suficiente preservam a preferência atual da interface.
 */
export function resolveQuestionLocale(question: string, fallbackLocale: Locale): Locale {
  const words = normalizedWords(question);
  const portugueseScore = score(words, PORTUGUESE_MARKERS);
  const englishScore = score(words, ENGLISH_MARKERS);

  if (englishScore > portugueseScore) return 'en';
  if (portugueseScore > englishScore) return 'pt';
  return fallbackLocale;
}

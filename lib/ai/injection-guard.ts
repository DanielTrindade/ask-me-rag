import 'server-only';

export type InjectionReason =
  | 'formatting_anchor'
  | 'competence_bridge'
  | 'career_frame_solve'
  | 'context_reproduction';

export type InjectionGuardResult =
  | { decision: 'allowed'; reason: null }
  | { decision: 'blocked'; reason: InjectionReason };

type InjectionPattern = {
  reason: InjectionReason;
  pattern: RegExp;
};

/**
 * Regras determinísticas (sem chamada ao LLM) para as técnicas de injeção
 * confirmadas pelo red team: âncora de formatação (F1), ponte de competências
 * (F3) e moldura de carreira com pedido técnico externo (F2). As regras são
 * conservadoras: pontes exigem verbo de ação, moldura exige o nome da persona e
 * âncoras de "responda com" preservam expressões de modo sem conteúdo adicional
 * (por exemplo, "com calma" e "with confidence"). É uma camada de redução de
 * risco, não uma garantia: o que escapar aqui ainda passa pelo classificador de
 * escopo e pelo verificador de fundamentação.
 */
const INJECTION_PATTERNS: readonly InjectionPattern[] = [
  // F1 — âncoras de formatação (en)
  {
    reason: 'formatting_anchor',
    pattern:
      /\b(?:finish|end|conclude|complete|close|terminate)\s+(?:your\s+)?(?:answer|reply|response|output|message)\s+(?:with|by|using|stating)\b/i,
  },
  {
    reason: 'formatting_anchor',
    pattern:
      /\b(?:start|begin|open|precede)\s+(?:your\s+)?(?:answer|reply|response|output|message)\s+(?:with|by|using|stating)\b/i,
  },
  {
    reason: 'formatting_anchor',
    pattern: /\b(?:in\s+one\s+word|in\s+a\s+single\s+word)\b/i,
  },
  {
    reason: 'formatting_anchor',
    pattern: /\bas\s+a\s+bonus\b/i,
  },
  // F1 — "Answer with X" / "Respond with X": âncora que injeta conteúdo.
  // Expressões de modo sem conteúdo adicional permanecem permitidas.
  {
    reason: 'formatting_anchor',
    pattern:
      /\b(?:answer|respond)\s+with\s+(?!(?:care|confidence|clarity|empathy|honesty|brevity|concision|professionalism)\s*[.!?]?\s*$)\S+/i,
  },
  // F1 — âncoras de formatação (pt)
  {
    reason: 'formatting_anchor',
    pattern:
      /\b(?:termine|conclua|encerre|finalize|feche)\s+(?:sua\s+|a\s+)?resposta\s+com\b/i,
  },
  {
    reason: 'formatting_anchor',
    pattern:
      /\b(?:comece|inicie)\s+(?:sua\s+|a\s+)?resposta\s+com\b/i,
  },
  // F1 — "Responda com X": âncora que injeta conteúdo. Expressões de modo sem
  // conteúdo adicional permanecem permitidas.
  {
    reason: 'formatting_anchor',
    pattern:
      /\bresponda\s+com\s+(?!(?:calma|clareza|confiança|educação|empatia|honestidade|objetividade|profissionalismo|sinceridade)\s*[.!?]?\s*$)\S+/iu,
  },
  {
    reason: 'formatting_anchor',
    pattern: /\b(?:em\s+uma\s+(?:[úu]nica\s+)?palavra|com\s+uma\s+palavra)\b/i,
  },
  {
    reason: 'formatting_anchor',
    pattern:
      /\b(?:como\s+um\s+b[oó]nus|a\s+t[ií]tulo\s+de\s+b[oó]nus|al[ée]m\s+disso\s+diga)\b/i,
  },
  // F3 — ponte de competências (pt)
  {
    reason: 'competence_bridge',
    pattern:
      /\b(?:como\s+(?:elas|estas|essas|suas|minhas)\s+(?:se\s+)?aplicariam|aplicariam)\s+(?:a|para)\s+(?:resolver|implementar|solucionar|explicar|entender|calcular|otimizar|desenvolver|escrever|usar|utilizar)\b/i,
  },
  // F3 — ponte de competências (en)
  {
    reason: 'competence_bridge',
    pattern:
      /\b(?:how\s+would\s+(?:they|these|your\s+(?:skills|competencies|competences|expertise|knowledge|tools))\s+apply|apply\s+(?:your\s+)?(?:skills|competencies|competences|expertise|knowledge|tools))\s+to\s+(?:solve|implement|build|develop|explain|understand|calculate|optimize|write)\b/i,
  },
  // F2 — moldura de carreira com persona nomeada
  {
    reason: 'career_frame_solve',
    pattern: /\bcomo\s+daniel(?:\s+trindade)?\s+resolveria\b/i,
  },
  {
    reason: 'career_frame_solve',
    pattern: /\bhow\s+would\s+daniel\s+(?:solve|implement)\b/i,
  },
  // R2-1 — pedido para reproduzir os trechos recuperados (en). Exige verbo de
  // despejo + marcador de literalidade/totalidade + alvo (trechos, fontes...).
  {
    reason: 'context_reproduction',
    pattern:
      /\b(?:quote|repeat|output|print|list|dump|reproduce|copy)\b[^.?!]{0,60}\b(?:verbatim|word\s+for\s+word|in\s+full|all|every)\b[^.?!]{0,60}\b(?:chunks?|fragments?|passages?|excerpts?|snippets?|sources?|documents?)\b/i,
  },
  {
    reason: 'context_reproduction',
    pattern:
      /\b(?:verbatim|word\s+for\s+word)\b[^.?!]{0,60}\b(?:chunks?|fragments?|passages?|excerpts?|snippets?|context|sources?|documents?)\b/i,
  },
  {
    reason: 'context_reproduction',
    pattern:
      /\b(?:exact|full|complete)\s+(?:chunks?|fragments?|passages?|excerpts?)\s+(?:of\s+text\s+)?(?:that\s+)?you\s+retrieved\b/i,
  },
  // R2-1 — idem em português.
  {
    reason: 'context_reproduction',
    pattern:
      /\b(?:cite|repita|liste|mostre|copie|imprima|reproduza)\b[^.?!]{0,60}(?:na\s+[ií]ntegra|literalmente|palavra\s+por\s+palavra|\btod[oa]s\s+(?:os|as))[^.?!]{0,60}\b(?:trechos?|fragmentos?|chunks?|fontes?|documentos?|passagens?)\b/iu,
  },
  {
    reason: 'context_reproduction',
    pattern:
      /(?:na\s+[ií]ntegra|literalmente|palavra\s+por\s+palavra)[^.?!]{0,60}\b(?:trechos?|fragmentos?|chunks?|contexto|fontes?|documentos?|passagens?)\b/iu,
  },
];

export function inspectForPromptInjection(question: string): InjectionGuardResult {
  const text = question.normalize('NFC').trim();
  if (!text) return { decision: 'allowed', reason: null };
  for (const { reason, pattern } of INJECTION_PATTERNS) {
    if (pattern.test(text)) return { decision: 'blocked', reason };
  }
  return { decision: 'allowed', reason: null };
}

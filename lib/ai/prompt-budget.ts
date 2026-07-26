import 'server-only';

import type { PortfolioUIMessage } from '@/lib/chat-types';

export class PromptBudgetError extends Error {
  constructor(readonly category: 'required_content_exceeds_budget') {
    super(category);
    this.name = 'PromptBudgetError';
  }
}

export function estimateTextTokens(text: string) {
  if (!text) return 0;
  const utf8Bytes = new TextEncoder().encode(text).length;
  const structuralOverhead = (text.match(/[\n`*_#>|{}[\]]/g) ?? []).length;
  return Math.max(1, Math.ceil(utf8Bytes / 3) + Math.ceil(structuralOverhead / 4));
}

function messageText(message: PortfolioUIMessage) {
  return message.parts.flatMap((part) => part.type === 'text' ? [part.text] : []).join('');
}

export function estimateMessageTokens(message: PortfolioUIMessage) {
  return 4 + estimateTextTokens(messageText(message));
}

function groupHistory(messages: PortfolioUIMessage[]) {
  const turns: PortfolioUIMessage[][] = [];
  for (const message of messages) {
    if (message.role === 'user') turns.push([message]);
    else if (turns.length > 0) turns.at(-1)!.push(message);
  }
  return turns;
}

export function buildPromptBudget(input: {
  systemPrompt: string;
  messages: PortfolioUIMessage[];
  currentMessageId: string;
  historyTokenBudget: number;
  totalInputTokenBudget: number;
}) {
  const currentIndex = input.messages.findIndex((message) => message.id === input.currentMessageId);
  if (currentIndex < 0) throw new PromptBudgetError('required_content_exceeds_budget');
  const current = input.messages[currentIndex];
  const requiredTokens = estimateTextTokens(input.systemPrompt) + estimateMessageTokens(current);
  if (requiredTokens > input.totalInputTokenBudget) {
    throw new PromptBudgetError('required_content_exceeds_budget');
  }

  const effectiveHistoryBudget = Math.min(
    input.historyTokenBudget,
    input.totalInputTokenBudget - requiredTokens,
  );
  const selectedNewestFirst: PortfolioUIMessage[][] = [];
  let historyTokens = 0;
  const turns = groupHistory(input.messages.slice(0, currentIndex));
  for (const turn of [...turns].reverse()) {
    const turnTokens = turn.reduce((total, message) => total + estimateMessageTokens(message), 0);
    if (historyTokens + turnTokens > effectiveHistoryBudget) continue;
    selectedNewestFirst.push(turn);
    historyTokens += turnTokens;
  }
  const selectedHistory = selectedNewestFirst.reverse().flat();
  return {
    messages: [...selectedHistory, current],
    historyTokens,
    requiredTokens,
    estimatedInputTokens: requiredTokens + historyTokens,
  };
}

export function truncateTextToTokenBudget(text: string, tokenBudget: number) {
  if (tokenBudget <= 0) return '';
  if (estimateTextTokens(text) <= tokenBudget) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (estimateTextTokens(text.slice(0, middle)) <= tokenBudget) low = middle;
    else high = middle - 1;
  }
  const prefix = text.slice(0, low).trimEnd();
  const boundaries = ['\n\n', '\n', '. ', '! ', '? ', '; ', ', ', ' '];
  for (const candidate of boundaries) {
    const boundary = prefix.lastIndexOf(candidate);
    const minimum = candidate === ' ' ? prefix.length / 2 : prefix.length / 4;
    if (boundary >= minimum) {
      return prefix.slice(0, boundary + candidate.trim().length).trim();
    }
  }
  return prefix.trim();
}

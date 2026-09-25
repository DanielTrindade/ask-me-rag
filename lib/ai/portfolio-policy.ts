import 'server-only';

import type { Locale } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import type { RetrievedContext } from '@/lib/rag';

export type PortfolioRefusalReason = 'out_of_scope' | 'missing_evidence';

export function portfolioRefusal(locale: Locale, reason: PortfolioRefusalReason) {
  return t(locale, reason === 'out_of_scope'
    ? 'chat.scope.outOfScope'
    : 'chat.scope.missingEvidence');
}

export type PortfolioNotice = 'limited_scope' | 'partial_evidence';

/** Ressalvas das respostas graduadas (`limited`): responde, mas avisa o limite. */
export function portfolioNotice(locale: Locale, notice: PortfolioNotice) {
  return t(locale, notice === 'limited_scope'
    ? 'chat.scope.limitedScope'
    : 'chat.scope.partialEvidence');
}

export function hasGroundedPortfolioContext(retrieval: Pick<RetrievedContext, 'context' | 'sources'>) {
  return retrieval.context.trim().length > 0 && retrieval.sources.length > 0;
}

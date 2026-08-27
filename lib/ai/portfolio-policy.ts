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

export function hasGroundedPortfolioContext(retrieval: RetrievedContext) {
  return retrieval.context.trim().length > 0 && retrieval.sources.length > 0;
}

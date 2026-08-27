'use client';

import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { LocaleToggle } from '@/components/locale-toggle';
import { t, type Locale } from '@/lib/i18n';

interface BreakdownItem {
  name: string;
  count: number;
}

interface Summary {
  conversations: number;
  messages: number;
  requests: number;
  admitted: number;
  blocked: number;
  providerCalls: number;
  completed: number;
  failed: number;
  aborted: number;
  averageDurationMs: number | null;
  totalTokens: number | null;
  knownCostUsd: number | null;
  unknownCostRequests: number;
  cacheHits: number;
  cacheEligible: number;
  cacheHitRate: number | null;
  dailyUsage: number | null;
  dailyLimit: number | null;
  dailyResetAt: string | null;
  governanceMode: 'off' | 'shadow' | 'enforce';
  killSwitch: boolean;
  providerModels: Array<{
    provider: string | null;
    model: string | null;
    requests: number;
    tokens: number | null;
    cost_usd: number | null;
  }>;
  failuresByCategory: Array<{ category: string; count: number }>;
  devices: BreakdownItem[];
  browsers: BreakdownItem[];
  lastRetentionAt: string | null;
}

interface Conversation {
  id: string;
  startedAt: string;
  lastActivityAt: string;
  deviceType: string;
  isBot: boolean;
  osName: string;
  osMajor: string;
  browserName: string;
  browserMajor: string;
  preferredLanguage: string;
  ipAvailable: boolean;
  maskedIp: string;
  messageCount: number;
  requestCount: number;
  lastStatus: string | null;
}

interface DetailMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'complete' | 'partial';
  sources: Array<{ name: string; matchedChunks: number }>;
  createdAt: string;
}

interface DetailRequest {
  id: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  status: string;
  provider: string | null;
  model: string | null;
  totalTokens: number | null;
  errorCategory: string | null;
  governanceDecision: string;
  cacheStatus: string;
  providerAttempts: number;
  retryable: boolean | null;
  providerCalled: boolean;
  inputCostUsd: number | null;
  outputCostUsd: number | null;
  totalCostUsd: number | null;
  costCurrency: string | null;
  pricingVersion: string | null;
}

interface Detail {
  conversation: Omit<Conversation, 'maskedIp' | 'messageCount' | 'requestCount' | 'lastStatus'>;
  messages: DetailMessage[];
  requests: DetailRequest[];
  maskedIp: string;
}

const OBSERVABILITY_LOCALE_KEY = 'chat-locale';

/** Revealing an IP is audited and deleting a conversation is final; both ask
 *  first, in the page, rather than through a native confirm() that freezes it. */
type PendingAction = 'reveal' | 'delete' | null;

/**
 * Inspecting a conversation is one small state machine, not six independent
 * values: opening clears any revealed IP and half-answered confirmation from
 * the previous row, closing clears everything, and a confirmation can only be
 * busy while it is pending. Separate useState calls let those drift apart —
 * the old code had to remember to reset four of them by hand on every open.
 */
interface Inspection {
  selectedId: string | null;
  detail: Detail | null;
  loading: boolean;
  revealedIp: string | null;
  pending: PendingAction;
  busy: boolean;
}

const NO_INSPECTION: Inspection = {
  selectedId: null,
  detail: null,
  loading: false,
  revealedIp: null,
  pending: null,
  busy: false,
};

type InspectionAction =
  | { type: 'open'; id: string }
  | { type: 'loaded'; detail: Detail }
  | { type: 'close' }
  | { type: 'revealed'; ip: string }
  | { type: 'confirm'; action: PendingAction }
  | { type: 'busy'; busy: boolean };

function inspectionReducer(state: Inspection, action: InspectionAction): Inspection {
  switch (action.type) {
    case 'open':
      return { ...NO_INSPECTION, selectedId: action.id, loading: true };
    case 'loaded':
      return { ...state, detail: action.detail, loading: false };
    case 'close':
      return NO_INSPECTION;
    case 'revealed':
      return { ...state, revealedIp: action.ip };
    case 'confirm':
      return { ...state, pending: action.action };
    case 'busy':
      return { ...state, busy: action.busy };
  }
}

const EMPTY_SUMMARY: Summary = {
  conversations: 0,
  messages: 0,
  requests: 0,
  admitted: 0,
  blocked: 0,
  providerCalls: 0,
  completed: 0,
  failed: 0,
  aborted: 0,
  averageDurationMs: null,
  totalTokens: null,
  knownCostUsd: null,
  unknownCostRequests: 0,
  cacheHits: 0,
  cacheEligible: 0,
  cacheHitRate: null,
  dailyUsage: null,
  dailyLimit: null,
  dailyResetAt: null,
  governanceMode: 'off',
  killSwitch: false,
  providerModels: [],
  failuresByCategory: [],
  devices: [],
  browsers: [],
  lastRetentionAt: null,
};

const DATE_FORMATTERS: Record<Locale, Intl.DateTimeFormat> = {
  pt: new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'UTC',
  }),
  en: new Intl.DateTimeFormat('en-US', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'UTC',
  }),
};

const NUMBER_FORMATTERS: Record<Locale, Intl.NumberFormat> = {
  pt: new Intl.NumberFormat('pt-BR'),
  en: new Intl.NumberFormat('en-US'),
};

const CURRENCY_FORMATTERS: Record<Locale, Intl.NumberFormat> = {
  pt: new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }),
  en: new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }),
};

function formatDate(value: string | null, locale: Locale) {
  if (!value) return t(locale, 'observability.unavailable');
  return DATE_FORMATTERS[locale].format(new Date(value));
}

function formatNumber(value: number | null, locale: Locale) {
  return value === null
    ? t(locale, 'observability.unavailable')
    : NUMBER_FORMATTERS[locale].format(value);
}

function formatCurrency(value: number | null, locale: Locale) {
  return value === null
    ? t(locale, 'observability.unavailable')
    : CURRENCY_FORMATTERS[locale].format(value);
}

function retentionHealth(lastRun: string | null, locale: Locale) {
  if (!lastRun) return { label: t(locale, 'observability.noRetention'), delayed: true };
  const hours = (Date.now() - new Date(lastRun).getTime()) / 3_600_000;
  return {
    label: t(locale, hours > 36 ? 'observability.retentionDelayed' : 'observability.retentionHealthy'),
    delayed: hours > 36,
  };
}

function statusLabel(locale: Locale, status: string | null) {
  const supported = ['completed', 'failed', 'aborted', 'running'] as const;
  return supported.includes(status as (typeof supported)[number])
    ? t(locale, `observability.${status}`)
    : t(locale, 'observability.unknown');
}

function deviceLabel(locale: Locale, device: string) {
  if (device === 'mobile') return t(locale, 'observability.mobile');
  if (device === 'unknown') return t(locale, 'observability.unknown');
  return device.charAt(0).toUpperCase() + device.slice(1);
}

/**
 * Two weights, because the numbers are two different jobs. A figure is watched
 * — you come to the page to see it. A ledger cell is looked up — you read it
 * when something already looks wrong. Eleven cards at one weight said neither.
 */
function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="observability-figure">
      <span className="observability-figure-label">{label}</span>
      <span className="observability-figure-value">{value}</span>
      {note && <span className="observability-figure-note">{note}</span>}
    </div>
  );
}

type DotTone = 'neutral' | 'healthy' | 'warning' | 'error';

function LedgerCell({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: DotTone;
}) {
  return (
    <div className="observability-ledger-cell">
      <span className="observability-ledger-label">{label}</span>
      <span className="observability-ledger-value">
        {tone && <span className={`status-dot is-${tone}`} aria-hidden="true" />}
        {value}
      </span>
      {note && <span className="observability-ledger-note">{note}</span>}
    </div>
  );
}

/** Quota and cache read as health, not as numbers, once they cross a line. */
function quotaTone(percent: number | null): DotTone {
  if (percent === null) return 'neutral';
  if (percent >= 90) return 'error';
  if (percent >= 75) return 'warning';
  return 'healthy';
}

function Breakdown({ title, items, locale }: { title: string; items: BreakdownItem[]; locale: Locale }) {
  const max = Math.max(...items.map((item) => Number(item.count)), 1);
  return (
    <Card className="observability-breakdown" variant="muted" padding={5}>
      <Heading level={2}>{title}</Heading>
      {items.length === 0 ? (
        <Text as="p" color="secondary">{t(locale, 'observability.noData')}</Text>
      ) : (
        <div className="observability-bars">
          {items.slice(0, 6).map((item) => (
            <div className="observability-bar-row" key={item.name}>
              <span>{item.name || t(locale, 'observability.unknown')}</span>
              <div aria-hidden="true"><i style={{ width: `${(Number(item.count) / max) * 100}%` }} /></div>
              <strong>{formatNumber(Number(item.count), locale)}</strong>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/**
 * Filters move together — every change refetches the same two endpoints — so
 * they travel as one value with one reducer instead of seven setters threaded
 * through the tree. It also makes "clear" a single action rather than six.
 */
interface Filters {
  periodDays: number;
  query: string;
  status: string;
  device: string;
  browser: string;
  bot: string;
  ip: string;
}

const INITIAL_FILTERS: Filters = {
  periodDays: 1,
  query: '',
  status: '',
  device: '',
  browser: '',
  bot: '',
  ip: '',
};

type FilterAction =
  | { type: 'set'; key: Exclude<keyof Filters, 'periodDays'>; value: string }
  | { type: 'period'; days: number }
  | { type: 'clear' };

function filtersReducer(state: Filters, action: FilterAction): Filters {
  switch (action.type) {
    case 'set':
      return { ...state, [action.key]: action.value };
    case 'period':
      return { ...state, periodDays: action.days };
    // The period is the window you are looking at, not something left switched
    // on by accident, so clearing leaves it where it is.
    case 'clear':
      return { ...INITIAL_FILTERS, periodDays: state.periodDays };
  }
}

function countActiveFilters(filters: Filters): number {
  return [
    filters.query.trim(),
    filters.status,
    filters.device,
    filters.browser.trim(),
    filters.bot,
    filters.ip.trim(),
  ].filter(Boolean).length;
}

function ConsoleHero({
  locale,
  setLocale,
}: {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}) {
  return (
    <header className="observability-hero">
      <div>
        <span className="observability-kicker">{t(locale, 'observability.controlRoom')}</span>
        <Heading level={1} type="display-3">{t(locale, 'observability.title')}</Heading>
      </div>
      <div className="observability-hero-side">
        <Text as="p" color="secondary">{t(locale, 'observability.subtitle')}</Text>
        <LocaleToggle locale={locale} onChange={setLocale} />
      </div>
    </header>
  );
}

function CommandBar({
  locale,
  filters,
  dispatch,
}: {
  locale: Locale;
  filters: Filters;
  dispatch: React.Dispatch<FilterAction>;
}) {
  const activeCount = countActiveFilters(filters);
  const set = (key: Exclude<keyof Filters, 'periodDays'>) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => dispatch({ type: 'set', key, value: event.target.value });

  return (
    <section className="observability-command-bar" aria-label={t(locale, 'observability.filters')}>
      <div className="observability-command-fields">
        <label>
          <span>{t(locale, 'observability.period')}</span>
          <select
            value={filters.periodDays}
            onChange={(event) => dispatch({ type: 'period', days: Number(event.target.value) })}
          >
            <option value={1}>{t(locale, 'observability.period24')}</option>
            <option value={7}>{t(locale, 'observability.period7')}</option>
            <option value={30}>{t(locale, 'observability.period30')}</option>
          </select>
        </label>
        <label>
          <span>{t(locale, 'observability.search')}</span>
          <input value={filters.query} onChange={set('query')} placeholder={t(locale, 'observability.searchPlaceholder')} />
        </label>
        <label>
          <span>{t(locale, 'observability.status')}</span>
          <select value={filters.status} onChange={set('status')}>
            <option value="">{t(locale, 'observability.all')}</option>
            <option value="completed">{t(locale, 'observability.completed')}</option>
            <option value="failed">{t(locale, 'observability.failed')}</option>
            <option value="aborted">{t(locale, 'observability.aborted')}</option>
            <option value="running">{t(locale, 'observability.running')}</option>
          </select>
        </label>
        <label>
          <span>{t(locale, 'observability.device')}</span>
          <select value={filters.device} onChange={set('device')}>
            <option value="">{t(locale, 'observability.all')}</option>
            <option value="desktop">Desktop</option>
            <option value="mobile">{t(locale, 'observability.mobile')}</option>
            <option value="tablet">Tablet</option>
            <option value="bot">Bot</option>
            <option value="unknown">{t(locale, 'observability.unknown')}</option>
          </select>
        </label>
        <label>
          <span>{t(locale, 'observability.browser')}</span>
          <input value={filters.browser} onChange={set('browser')} placeholder={t(locale, 'observability.browserPlaceholder')} />
        </label>
        <label>
          <span>{t(locale, 'observability.botFilter')}</span>
          <select value={filters.bot} onChange={set('bot')}>
            <option value="">{t(locale, 'observability.all')}</option>
            <option value="false">{t(locale, 'observability.humans')}</option>
            <option value="true">{t(locale, 'observability.bots')}</option>
          </select>
        </label>
        <label>
          <span>{t(locale, 'observability.exactIp')}</span>
          <input value={filters.ip} onChange={set('ip')} placeholder={t(locale, 'observability.ipPlaceholder')} />
        </label>
      </div>
      {/* An empty table is otherwise indistinguishable from a filter left on
          three visits ago. The count says which one it is. */}
      {activeCount > 0 && (
        <div className="observability-command-footer">
          <span className="observability-filter-count" role="status">
            {activeCount}{' '}
            {t(locale, activeCount === 1
              ? 'observability.filtersActiveOne'
              : 'observability.filtersActiveMany')}
          </span>
          <Button
            label={t(locale, 'observability.clearFilters')}
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: 'clear' })}
          />
        </div>
      )}
    </section>
  );
}

function FiguresBand({
  locale,
  summary,
  completionRate,
}: {
  locale: Locale;
  summary: Summary;
  completionRate: number;
}) {
  return (
    <section className="observability-figures" aria-label={t(locale, 'observability.watched')}>
      <Figure
        label={t(locale, 'observability.conversations')}
        value={formatNumber(summary.conversations, locale)}
        note={`${formatNumber(summary.messages, locale)} ${t(locale, 'observability.messages')}`}
      />
      <Figure
        label={t(locale, 'observability.runHealth')}
        value={`${completionRate}%`}
        note={`${formatNumber(summary.completed, locale)} / ${formatNumber(summary.requests, locale)} ${t(locale, 'observability.requests').toLowerCase()}`}
      />
      <Figure
        label={t(locale, 'observability.spend')}
        value={formatCurrency(summary.knownCostUsd, locale)}
        note={`${formatNumber(summary.unknownCostRequests, locale)} ${t(locale, 'observability.unknownCost')}`}
      />
    </section>
  );
}

function LedgerStrip({
  locale,
  summary,
  quotaPercent,
  quotaAlert,
  retention,
}: {
  locale: Locale;
  summary: Summary;
  quotaPercent: number | null;
  quotaAlert: string;
  retention: ReturnType<typeof retentionHealth>;
}) {
  return (
    <section className="observability-ledger" aria-label={t(locale, 'observability.reference')}>
      <LedgerCell
        label={t(locale, 'observability.dailyBudget')}
        value={quotaPercent === null ? t(locale, 'observability.unavailable') : `${quotaPercent}%`}
        note={`${quotaAlert} · ${t(locale, 'observability.reset')}: ${formatDate(summary.dailyResetAt, locale)}`}
        tone={quotaTone(quotaPercent)}
      />
      <LedgerCell
        label={t(locale, 'observability.governance')}
        value={summary.killSwitch ? t(locale, 'observability.killSwitchOn') : summary.governanceMode}
        note={summary.killSwitch ? t(locale, 'observability.noProviderCalls') : t(locale, 'observability.killSwitchOff')}
        tone={summary.killSwitch ? 'error' : 'healthy'}
      />
      <LedgerCell
        label={t(locale, 'observability.retention')}
        value={retention.label}
        note={formatDate(summary.lastRetentionAt, locale)}
        tone={retention.delayed ? 'warning' : 'healthy'}
      />
      <LedgerCell
        label={t(locale, 'observability.admittedBlocked')}
        value={`${formatNumber(summary.admitted, locale)} / ${formatNumber(summary.blocked, locale)}`}
        note={`${formatNumber(summary.providerCalls, locale)} ${t(locale, 'observability.providerCalls')}`}
      />
      <LedgerCell
        label={t(locale, 'observability.cacheHitRate')}
        value={summary.cacheHitRate === null ? t(locale, 'observability.unavailable') : `${summary.cacheHitRate}%`}
        note={`${formatNumber(summary.cacheHits, locale)} / ${formatNumber(summary.cacheEligible, locale)}`}
      />
      <LedgerCell
        label={t(locale, 'observability.latency')}
        value={summary.averageDurationMs === null
          ? t(locale, 'observability.unavailable')
          : `${formatNumber(summary.averageDurationMs, locale)} ms`}
      />
      <LedgerCell
        label={t(locale, 'observability.tokens')}
        value={formatNumber(summary.totalTokens, locale)}
        note={summary.totalTokens === null
          ? t(locale, 'observability.providerMissing')
          : t(locale, 'observability.periodTotal')}
      />
      <LedgerCell
        label={t(locale, 'observability.failuresAborts')}
        value={`${formatNumber(summary.failed, locale)} / ${formatNumber(summary.aborted, locale)}`}
        tone={summary.failed > 0 ? 'error' : 'healthy'}
      />
    </section>
  );
}

function BreakdownGrid({ locale, summary }: { locale: Locale; summary: Summary }) {
  return (
    <section className="observability-breakdowns">
      <Breakdown title={t(locale, 'observability.devices')} items={summary.devices} locale={locale} />
      <Breakdown title={t(locale, 'observability.browsers')} items={summary.browsers} locale={locale} />
      <Breakdown
        title={t(locale, 'observability.providerModels')}
        items={summary.providerModels.map((item) => ({
          name: `${item.provider ?? 'unknown'} / ${item.model ?? 'unknown'}`,
          count: Number(item.requests),
        }))}
        locale={locale}
      />
      <Breakdown
        title={t(locale, 'observability.failureCategories')}
        items={summary.failuresByCategory.map((item) => ({
          name: item.category,
          count: Number(item.count),
        }))}
        locale={locale}
      />
    </section>
  );
}

const SKELETON_ROWS = [0, 1, 2];

function ConversationsTable({
  locale,
  loading,
  conversations,
  selectedId,
  selectConversation,
  nextCursor,
  loadingMore,
  loadMore,
}: {
  locale: Locale;
  loading: boolean;
  conversations: Conversation[];
  selectedId: string | null;
  selectConversation: (id: string) => void;
  nextCursor: string | null;
  loadingMore: boolean;
  loadMore: () => void;
}) {
  return (
    <Card className="observability-table-card" variant="muted" padding={0}>
      <div className="observability-section-heading">
        <div>
          <Heading level={2}>{t(locale, 'observability.recent')}</Heading>
          <Text as="p" color="secondary">{t(locale, 'observability.recentBody')}</Text>
        </div>
        {loading && <Badge variant="neutral" label={t(locale, 'observability.updating')} />}
      </div>
      <div className="observability-table-scroll">
        <table className="observability-table" aria-busy={loading}>
          <thead>
            <tr>
              <th scope="col">{t(locale, 'observability.time')}</th>
              <th scope="col">{t(locale, 'observability.status')}</th>
              <th scope="col">{t(locale, 'observability.device')}</th>
              <th scope="col">{t(locale, 'observability.ip')}</th>
              <th scope="col">{t(locale, 'observability.messages')}</th>
              <th scope="col"><span className="sr-only">{t(locale, 'observability.action')}</span></th>
            </tr>
          </thead>
          <tbody>
            {/* Skeletons only on the first load; a refetch keeps the rows it
                already has on screen rather than blinking them away. */}
            {loading && conversations.length === 0 && SKELETON_ROWS.map((row) => (
              <tr aria-hidden="true" className="observability-skeleton" key={row}>
                <td><span /></td><td><span /></td><td><span /></td>
                <td><span /></td><td><span /></td><td><span /></td>
              </tr>
            ))}
            {!loading && conversations.length === 0 && (
              <tr><td colSpan={6} className="observability-empty">{t(locale, 'observability.empty')}</td></tr>
            )}
            {conversations.map((conversation) => (
              <tr key={conversation.id} className={selectedId === conversation.id ? 'is-selected' : undefined}>
                <td><strong>{formatDate(conversation.lastActivityAt, locale)}</strong><small>{conversation.id.slice(0, 8)}</small></td>
                <td><span className={`observability-status status-${conversation.lastStatus ?? 'unknown'}`}>{statusLabel(locale, conversation.lastStatus)}</span></td>
                <td>{deviceLabel(locale, conversation.deviceType)}<small>{conversation.browserName} {conversation.browserMajor} · {conversation.osName}</small></td>
                <td><code>{conversation.maskedIp}</code></td>
                <td>{conversation.messageCount}</td>
                <td><Button label={t(locale, 'observability.inspect')} variant="ghost" size="sm" onClick={() => void selectConversation(conversation.id)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nextCursor && (
        <div className="observability-load-more">
          <Button
            label={t(locale, loadingMore ? 'observability.loading' : 'observability.loadMore')}
            variant="ghost"
            size="sm"
            isDisabled={loadingMore}
            onClick={() => void loadMore()}
          />
        </div>
      )}
    </Card>
  );
}

function DetailActions({
  locale,
  detail,
  revealedIp,
  pendingAction,
  setPendingAction,
  confirmPendingAction,
  actionBusy,
  onCloseDetail,
}: {
  locale: Locale;
  detail: Detail | null;
  revealedIp: string | null;
  pendingAction: PendingAction;
  setPendingAction: (action: PendingAction) => void;
  confirmPendingAction: () => void;
  actionBusy: boolean;
  onCloseDetail: () => void;
}) {
  // The confirmation is inline, not modal: the panel behind it stays readable
  // while you decide, so no dialog role and no focus trap.
  if (pendingAction) {
    return (
      <div className="observability-danger">
        <p role="alert">
          {t(locale, pendingAction === 'reveal' ? 'observability.revealPrompt' : 'observability.deletePrompt')}
        </p>
        <HStack gap={2} wrap="wrap" hAlign="end">
          <Button label={t(locale, 'observability.cancel')} variant="ghost" size="sm" onClick={() => setPendingAction(null)} />
          <Button
            label={pendingAction === 'reveal' ? t(locale, 'observability.revealIp') : t(locale, 'observability.delete')}
            variant={pendingAction === 'delete' ? 'destructive' : 'primary'}
            size="sm"
            isLoading={actionBusy}
            onClick={() => void confirmPendingAction()}
          />
        </HStack>
      </div>
    );
  }

  return (
    <HStack gap={2} wrap="wrap">
      <Button
        label={t(locale, 'observability.revealIp')}
        variant="ghost"
        size="sm"
        isDisabled={!detail?.conversation.ipAvailable || revealedIp !== null}
        onClick={() => setPendingAction('reveal')}
      />
      <Button label={t(locale, 'observability.delete')} variant="ghost" size="sm" onClick={() => setPendingAction('delete')} />
      <Button label={t(locale, 'observability.close')} variant="ghost" size="sm" onClick={onCloseDetail} />
    </HStack>
  );
}

function DetailRun({ locale, request }: { locale: Locale; request: DetailRequest }) {
  return (
    <div className="observability-run">
      <span className={`observability-status status-${request.status}`}>
        {statusLabel(locale, request.status)}
      </span>
      <small>
        {request.durationMs === null
          ? t(locale, 'observability.latencyUnavailable')
          : `${request.durationMs} ms`} · {request.totalTokens === null
          ? t(locale, 'observability.tokensUnavailable')
          : `${request.totalTokens} tokens`}
      </small>
      <small>
        {request.provider ?? t(locale, 'observability.providerUnknown')} / {request.model ?? t(locale, 'observability.modelUnknown')}
      </small>
      <small>
        {t(locale, 'observability.decision')}: {request.governanceDecision} · {t(locale, 'observability.cache')}: {request.cacheStatus}
      </small>
      <small>
        {t(locale, 'observability.attempts')}: {request.providerAttempts} · {t(locale, 'observability.cost')}: {formatCurrency(request.totalCostUsd, locale)}
      </small>
      {request.errorCategory && (
        <small>
          {t(locale, 'observability.errorCategory')}: {request.errorCategory} · retry: {String(request.retryable)}
        </small>
      )}
    </div>
  );
}

function DetailBody({
  locale,
  detail,
  revealedIp,
}: {
  locale: Locale;
  detail: Detail;
  revealedIp: string | null;
}) {
  return (
    <div className="observability-detail-grid">
      <aside>
        <dl>
          <div><dt>IP</dt><dd><code>{revealedIp ?? detail.maskedIp}</code></dd></div>
          <div><dt>{t(locale, 'observability.device')}</dt><dd>{deviceLabel(locale, detail.conversation.deviceType)}</dd></div>
          <div><dt>{t(locale, 'observability.browsers')}</dt><dd>{detail.conversation.browserName} {detail.conversation.browserMajor}</dd></div>
          <div><dt>{t(locale, 'observability.system')}</dt><dd>{detail.conversation.osName} {detail.conversation.osMajor}</dd></div>
          <div><dt>{t(locale, 'observability.language')}</dt><dd>{detail.conversation.preferredLanguage}</dd></div>
        </dl>
        <Heading level={3}>{t(locale, 'observability.runs')}</Heading>
        {detail.requests.map((request) => (
          <DetailRun key={request.id} locale={locale} request={request} />
        ))}
      </aside>
      <div className="observability-timeline">
        {detail.messages.map((message) => (
          <article className={`observability-event role-${message.role}`} key={`${message.role}-${message.id}`}>
            <header>
              <strong>{t(locale, message.role === 'user' ? 'observability.user' : 'observability.assistant')}</strong>
              <time>{formatDate(message.createdAt, locale)}</time>
              {message.status === 'partial' && <Badge variant="neutral" label={t(locale, 'observability.partial')} />}
            </header>
            <p>{message.content}</p>
            {message.sources.length > 0 && (
              <footer>{t(locale, 'observability.sources')}: {message.sources.map((source) => source.name).join(', ')}</footer>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

interface ConversationDetailProps {
  locale: Locale;
  selectedId: string;
  detail: Detail | null;
  detailLoading: boolean;
  revealedIp: string | null;
  pendingAction: PendingAction;
  setPendingAction: (action: PendingAction) => void;
  confirmPendingAction: () => void;
  actionBusy: boolean;
  detailRef: React.RefObject<HTMLDivElement | null>;
  onCloseDetail: () => void;
}

function ConversationDetail({
  locale,
  selectedId,
  detail,
  detailLoading,
  revealedIp,
  pendingAction,
  setPendingAction,
  confirmPendingAction,
  actionBusy,
  detailRef,
  onCloseDetail,
}: ConversationDetailProps) {
  const shortId = selectedId.slice(0, 8);

  return (
    <Card
      ref={detailRef}
      className="observability-detail"
      variant="muted"
      padding={5}
      tabIndex={-1}
      aria-label={`${t(locale, 'observability.conversation')} ${shortId}`}
    >
      <div className="observability-section-heading">
        <div>
          <Text type="supporting" color="secondary">{t(locale, 'observability.conversation')} {shortId}</Text>
          <Heading level={2}>{t(locale, 'observability.timeline')}</Heading>
        </div>
        <DetailActions
          locale={locale}
          detail={detail}
          revealedIp={revealedIp}
          pendingAction={pendingAction}
          setPendingAction={setPendingAction}
          confirmPendingAction={confirmPendingAction}
          actionBusy={actionBusy}
          onCloseDetail={onCloseDetail}
        />
      </div>
      {detailLoading
        ? <Text as="p" color="secondary">{t(locale, 'observability.detailLoading')}</Text>
        : detail && <DetailBody locale={locale} detail={detail} revealedIp={revealedIp} />}
    </Card>
  );
}

interface ObservabilityViewProps extends Omit<ConversationDetailProps, 'selectedId'> {
  setLocale: (locale: Locale) => void;
  filters: Filters;
  dispatchFilters: React.Dispatch<FilterAction>;
  error: string | null;
  summary: Summary;
  completionRate: number;
  quotaPercent: number | null;
  quotaAlert: string;
  retention: ReturnType<typeof retentionHealth>;
  loading: boolean;
  conversations: Conversation[];
  selectedId: string | null;
  selectConversation: (id: string) => void;
  nextCursor: string | null;
  loadingMore: boolean;
  loadMore: () => void;
}

function ObservabilityView(props: ObservabilityViewProps) {
  const { locale, error, selectedId } = props;

  return (
    <VStack className="observability-console" gap={6}>
      <ConsoleHero locale={locale} setLocale={props.setLocale} />
      <CommandBar locale={locale} filters={props.filters} dispatch={props.dispatchFilters} />

      {error && <div className="observability-alert" role="alert">{error}</div>}

      <FiguresBand locale={locale} summary={props.summary} completionRate={props.completionRate} />
      <LedgerStrip
        locale={locale}
        summary={props.summary}
        quotaPercent={props.quotaPercent}
        quotaAlert={props.quotaAlert}
        retention={props.retention}
      />
      <BreakdownGrid locale={locale} summary={props.summary} />

      <ConversationsTable
        locale={locale}
        loading={props.loading}
        conversations={props.conversations}
        selectedId={selectedId}
        selectConversation={props.selectConversation}
        nextCursor={props.nextCursor}
        loadingMore={props.loadingMore}
        loadMore={props.loadMore}
      />

      {selectedId && (
        <ConversationDetail
          locale={locale}
          selectedId={selectedId}
          detail={props.detail}
          detailLoading={props.detailLoading}
          revealedIp={props.revealedIp}
          pendingAction={props.pendingAction}
          setPendingAction={props.setPendingAction}
          confirmPendingAction={props.confirmPendingAction}
          actionBusy={props.actionBusy}
          detailRef={props.detailRef}
          onCloseDetail={props.onCloseDetail}
        />
      )}
    </VStack>
  );
}

export function ObservabilityMonitor() {
  const [filters, dispatchFilters] = useReducer(filtersReducer, INITIAL_FILTERS);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [inspection, dispatchInspection] = useReducer(inspectionReducer, NO_INSPECTION);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locale, setLocale] = useState<Locale>('pt');
  const [localeReady, setLocaleReady] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = window.localStorage.getItem(OBSERVABILITY_LOCALE_KEY);
      if (saved === 'pt' || saved === 'en') setLocale(saved);
      setLocaleReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!localeReady) return;
    window.localStorage.setItem(OBSERVABILITY_LOCALE_KEY, locale);
    document.documentElement.lang = locale === 'pt' ? 'pt-BR' : 'en';
  }, [locale, localeReady]);

  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - filters.periodDays * 24 * 60 * 60 * 1_000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [filters.periodDays]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams(range);
    params.set('limit', '25');
    if (filters.query.trim()) params.set('query', filters.query.trim());
    if (filters.status) params.set('status', filters.status);
    if (filters.device) params.set('device', filters.device);
    if (filters.browser.trim()) params.set('browser', filters.browser.trim());
    if (filters.bot) params.set('bot', filters.bot);
    if (filters.ip.trim()) params.set('ip', filters.ip.trim());
    return params;
  }, [filters, range]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryResponse, conversationsResponse] = await Promise.all([
        fetch(`/api/admin/observability/summary?${new URLSearchParams(range)}`, { cache: 'no-store' }),
        fetch(`/api/admin/observability/conversations?${queryParams}`, { cache: 'no-store' }),
      ]);
      if (!summaryResponse.ok || !conversationsResponse.ok) throw new Error('request_failed');
      const summaryPayload = (await summaryResponse.json()) as { summary: Summary };
      const conversationsPayload = (await conversationsResponse.json()) as {
        conversations: Conversation[];
        nextCursor: string | null;
      };
      setSummary({ ...EMPTY_SUMMARY, ...summaryPayload.summary });
      setConversations(conversationsPayload.conversations);
      setNextCursor(conversationsPayload.nextCursor);
    } catch {
      setError(t(locale, 'observability.loadError'));
    } finally {
      setLoading(false);
    }
  }, [locale, queryParams, range]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  // The detail panel opens below the table, often off screen. Bring it into
  // view and move focus to it, so keyboard and pointer land in the same place.
  useEffect(() => {
    if (!inspection.selectedId) return;
    const node = detailRef.current;
    if (!node) return;
    node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    node.focus({ preventScroll: true });
  }, [inspection.selectedId]);

  // Escape backs out one step: the confirmation first, then the panel.
  useEffect(() => {
    if (!inspection.selectedId) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      dispatchInspection(
        inspection.pending ? { type: 'confirm', action: null } : { type: 'close' },
      );
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inspection.pending, inspection.selectedId]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams(queryParams);
      params.set('cursor', nextCursor);
      const response = await fetch(`/api/admin/observability/conversations?${params}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('request_failed');
      const payload = (await response.json()) as { conversations: Conversation[]; nextCursor: string | null };
      setConversations((current) => [...current, ...payload.conversations]);
      setNextCursor(payload.nextCursor);
    } catch {
      setError(t(locale, 'observability.loadMoreError'));
    } finally {
      setLoadingMore(false);
    }
  }

  async function selectConversation(id: string) {
    // 'open' resets the previous row's revealed IP and pending confirmation.
    dispatchInspection({ type: 'open', id });
    try {
      const response = await fetch(`/api/admin/observability/conversations/${id}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('request_failed');
      dispatchInspection({ type: 'loaded', detail: (await response.json()) as Detail });
    } catch {
      setError(t(locale, 'observability.unavailableConversation'));
      dispatchInspection({ type: 'close' });
    }
  }

  async function revealIp() {
    const id = inspection.selectedId;
    if (!id) return;
    const response = await fetch(`/api/admin/observability/conversations/${id}/reveal-ip`, {
      method: 'POST',
      cache: 'no-store',
    });
    if (!response.ok) {
      setError(response.status === 410 ? t(locale, 'observability.ipExpired') : t(locale, 'observability.revealError'));
      return;
    }
    const payload = (await response.json()) as { ip: string };
    dispatchInspection({ type: 'revealed', ip: payload.ip });
  }

  async function deleteConversation() {
    const id = inspection.selectedId;
    if (!id) return;
    const response = await fetch(`/api/admin/observability/conversations/${id}`, {
      method: 'DELETE',
      cache: 'no-store',
    });
    if (!response.ok) {
      setError(t(locale, 'observability.deleteError'));
      return;
    }
    dispatchInspection({ type: 'close' });
    await load();
  }

  async function confirmPendingAction() {
    const { pending, busy } = inspection;
    if (!pending || busy) return;
    dispatchInspection({ type: 'busy', busy: true });
    try {
      if (pending === 'reveal') await revealIp();
      else await deleteConversation();
    } finally {
      // A successful delete already reset to NO_INSPECTION; these are no-ops
      // on that state and the reset the reveal path needs on this one.
      dispatchInspection({ type: 'busy', busy: false });
      dispatchInspection({ type: 'confirm', action: null });
    }
  }

  const retention = retentionHealth(summary.lastRetentionAt, locale);
  const completionRate = summary.requests
    ? Math.round((summary.completed / summary.requests) * 100)
    : 0;
  const quotaPercent = summary.dailyUsage !== null && summary.dailyLimit
    ? Math.min(100, Math.round((summary.dailyUsage / summary.dailyLimit) * 100))
    : null;
  const quotaAlert = quotaPercent === null
    ? t(locale, 'observability.unavailable')
    : quotaPercent >= 100 ? '100%'
      : quotaPercent >= 90 ? '90%+'
        : quotaPercent >= 75 ? '75%+'
          : quotaPercent >= 50 ? '50%+'
            : t(locale, 'observability.withinBudget');

  return (
    <ObservabilityView
      locale={locale}
      setLocale={setLocale}
      filters={filters}
      dispatchFilters={dispatchFilters}
      error={error}
      summary={summary}
      completionRate={completionRate}
      quotaPercent={quotaPercent}
      quotaAlert={quotaAlert}
      retention={retention}
      loading={loading}
      conversations={conversations}
      selectedId={inspection.selectedId}
      selectConversation={selectConversation}
      nextCursor={nextCursor}
      loadingMore={loadingMore}
      loadMore={loadMore}
      detail={inspection.detail}
      detailLoading={inspection.loading}
      revealedIp={inspection.revealedIp}
      pendingAction={inspection.pending}
      setPendingAction={(action) => dispatchInspection({ type: 'confirm', action })}
      confirmPendingAction={confirmPendingAction}
      actionBusy={inspection.busy}
      detailRef={detailRef}
      onCloseDetail={() => dispatchInspection({ type: 'close' })}
    />
  );
}

'use client';

import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  completed: number;
  failed: number;
  aborted: number;
  averageDurationMs: number | null;
  totalTokens: number | null;
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
}

interface Detail {
  conversation: Omit<Conversation, 'maskedIp' | 'messageCount' | 'requestCount' | 'lastStatus'>;
  messages: DetailMessage[];
  requests: DetailRequest[];
  maskedIp: string;
}

const OBSERVABILITY_LOCALE_KEY = 'chat-locale';

const EMPTY_SUMMARY: Summary = {
  conversations: 0,
  messages: 0,
  requests: 0,
  completed: 0,
  failed: 0,
  aborted: 0,
  averageDurationMs: null,
  totalTokens: null,
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

function formatDate(value: string | null, locale: Locale) {
  if (!value) return t(locale, 'observability.unavailable');
  return DATE_FORMATTERS[locale].format(new Date(value));
}

function formatNumber(value: number | null, locale: Locale) {
  return value === null
    ? t(locale, 'observability.unavailable')
    : NUMBER_FORMATTERS[locale].format(value);
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

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card className="observability-metric" variant="muted" padding={4}>
      <Text type="supporting" color="secondary">{label}</Text>
      <strong>{value}</strong>
      {note && <span>{note}</span>}
    </Card>
  );
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

export function ObservabilityMonitor() {
  const [periodDays, setPeriodDays] = useState(1);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('');
  const [browserFilter, setBrowserFilter] = useState('');
  const [botFilter, setBotFilter] = useState('');
  const [ipFilter, setIpFilter] = useState('');
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [revealedIp, setRevealedIp] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
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
    const from = new Date(to.getTime() - periodDays * 24 * 60 * 60 * 1_000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [periodDays]);

  const filters = useMemo(() => {
    const params = new URLSearchParams(range);
    params.set('limit', '25');
    if (query.trim()) params.set('query', query.trim());
    if (statusFilter) params.set('status', statusFilter);
    if (deviceFilter) params.set('device', deviceFilter);
    if (browserFilter.trim()) params.set('browser', browserFilter.trim());
    if (botFilter) params.set('bot', botFilter);
    if (ipFilter.trim()) params.set('ip', ipFilter.trim());
    return params;
  }, [botFilter, browserFilter, deviceFilter, ipFilter, query, range, statusFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryResponse, conversationsResponse] = await Promise.all([
        fetch(`/api/admin/observability/summary?${new URLSearchParams(range)}`, { cache: 'no-store' }),
        fetch(`/api/admin/observability/conversations?${filters}`, { cache: 'no-store' }),
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
  }, [filters, locale, range]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams(filters);
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
    setSelectedId(id);
    setDetail(null);
    setRevealedIp(null);
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/admin/observability/conversations/${id}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('request_failed');
      setDetail((await response.json()) as Detail);
    } catch {
      setError(t(locale, 'observability.unavailableConversation'));
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function revealIp() {
    if (!selectedId || !window.confirm(t(locale, 'observability.revealConfirm'))) return;
    const response = await fetch(`/api/admin/observability/conversations/${selectedId}/reveal-ip`, {
      method: 'POST',
      cache: 'no-store',
    });
    if (!response.ok) {
      setError(response.status === 410 ? t(locale, 'observability.ipExpired') : t(locale, 'observability.revealError'));
      return;
    }
    const payload = (await response.json()) as { ip: string };
    setRevealedIp(payload.ip);
  }

  async function deleteConversation() {
    if (!selectedId || !window.confirm(t(locale, 'observability.deleteConfirm'))) return;
    const response = await fetch(`/api/admin/observability/conversations/${selectedId}`, {
      method: 'DELETE',
      cache: 'no-store',
    });
    if (!response.ok) {
      setError(t(locale, 'observability.deleteError'));
      return;
    }
    setSelectedId(null);
    setDetail(null);
    setRevealedIp(null);
    await load();
  }

  const retention = retentionHealth(summary.lastRetentionAt, locale);
  const completionRate = summary.requests
    ? Math.round((summary.completed / summary.requests) * 100)
    : 0;

  return (
    <VStack className="observability-console" gap={6}>
      <header className="observability-hero">
        <div>
          <Text type="supporting" color="secondary">{t(locale, 'observability.controlRoom')}</Text>
          <Heading level={1} type="display-3">{t(locale, 'observability.title')}</Heading>
        </div>
        <div className="observability-hero-side">
          <Text as="p" color="secondary">{t(locale, 'observability.subtitle')}</Text>
          <LocaleToggle locale={locale} onChange={setLocale} />
        </div>
      </header>
      <section className="observability-command-bar" aria-label={t(locale, 'observability.filters')}>
        <label>
          <span>{t(locale, 'observability.period')}</span>
          <select value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value))}>
            <option value={1}>{t(locale, 'observability.period24')}</option>
            <option value={7}>{t(locale, 'observability.period7')}</option>
            <option value={30}>{t(locale, 'observability.period30')}</option>
          </select>
        </label>
        <label>
          <span>{t(locale, 'observability.search')}</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t(locale, 'observability.searchPlaceholder')} />
        </label>
        <label>
          <span>{t(locale, 'observability.status')}</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">{t(locale, 'observability.all')}</option>
            <option value="completed">{t(locale, 'observability.completed')}</option>
            <option value="failed">{t(locale, 'observability.failed')}</option>
            <option value="aborted">{t(locale, 'observability.aborted')}</option>
            <option value="running">{t(locale, 'observability.running')}</option>
          </select>
        </label>
        <label>
          <span>{t(locale, 'observability.device')}</span>
          <select value={deviceFilter} onChange={(event) => setDeviceFilter(event.target.value)}>
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
          <input value={browserFilter} onChange={(event) => setBrowserFilter(event.target.value)} placeholder={t(locale, 'observability.browserPlaceholder')} />
        </label>
        <label>
          <span>{t(locale, 'observability.botFilter')}</span>
          <select value={botFilter} onChange={(event) => setBotFilter(event.target.value)}>
            <option value="">{t(locale, 'observability.all')}</option>
            <option value="false">{t(locale, 'observability.humans')}</option>
            <option value="true">{t(locale, 'observability.bots')}</option>
          </select>
        </label>
        <label>
          <span>{t(locale, 'observability.exactIp')}</span>
          <input value={ipFilter} onChange={(event) => setIpFilter(event.target.value)} placeholder={t(locale, 'observability.ipPlaceholder')} />
        </label>
      </section>

      {error && <div className="observability-alert" role="alert">{error}</div>}

      <section className="observability-metrics" aria-label={t(locale, 'observability.metrics')}>
        <Metric label={t(locale, 'observability.conversations')} value={formatNumber(summary.conversations, locale)} note={`${formatNumber(summary.messages, locale)} ${t(locale, 'observability.messages')}`} />
        <Metric label={t(locale, 'observability.requests')} value={formatNumber(summary.requests, locale)} note={`${completionRate}% ${t(locale, 'observability.completion')}`} />
        <Metric label={t(locale, 'observability.latency')} value={summary.averageDurationMs === null ? t(locale, 'observability.unavailable') : `${formatNumber(summary.averageDurationMs, locale)} ms`} />
        <Metric label={t(locale, 'observability.tokens')} value={formatNumber(summary.totalTokens, locale)} note={summary.totalTokens === null ? t(locale, 'observability.providerMissing') : t(locale, 'observability.periodTotal')} />
        <Metric label={t(locale, 'observability.failuresAborts')} value={`${formatNumber(summary.failed, locale)} / ${formatNumber(summary.aborted, locale)}`} />
        <Card className={`observability-metric retention ${retention.delayed ? 'is-delayed' : ''}`} variant="muted" padding={4}>
          <Text type="supporting" color="secondary">{t(locale, 'observability.retention')}</Text>
          <strong>{retention.label}</strong>
          <span>{formatDate(summary.lastRetentionAt, locale)}</span>
        </Card>
      </section>

      <section className="observability-breakdowns">
        <Breakdown title={t(locale, 'observability.devices')} items={summary.devices} locale={locale} />
        <Breakdown title={t(locale, 'observability.browsers')} items={summary.browsers} locale={locale} />
      </section>

      <Card className="observability-table-card" variant="muted" padding={0}>
        <div className="observability-section-heading">
          <div>
            <Heading level={2}>{t(locale, 'observability.recent')}</Heading>
            <Text as="p" color="secondary">{t(locale, 'observability.recentBody')}</Text>
          </div>
          {loading && <Badge variant="neutral" label={t(locale, 'observability.updating')} />}
        </div>
        <div className="observability-table-scroll">
          <table className="observability-table">
            <thead><tr><th>{t(locale, 'observability.time')}</th><th>{t(locale, 'observability.status')}</th><th>{t(locale, 'observability.device')}</th><th>{t(locale, 'observability.ip')}</th><th>{t(locale, 'observability.messages')}</th><th aria-label={t(locale, 'observability.action')}></th></tr></thead>
            <tbody>
              {!loading && conversations.length === 0 && <tr><td colSpan={6} className="observability-empty">{t(locale, 'observability.empty')}</td></tr>}
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
        {nextCursor && <div className="observability-load-more"><Button label={t(locale, loadingMore ? 'observability.loading' : 'observability.loadMore')} variant="ghost" size="sm" isDisabled={loadingMore} onClick={() => void loadMore()} /></div>}
      </Card>

      {selectedId && (
        <Card className="observability-detail" variant="muted" padding={5}>
          <div className="observability-section-heading">
            <div><Text type="supporting" color="secondary">{t(locale, 'observability.conversation')} {selectedId.slice(0, 8)}</Text><Heading level={2}>{t(locale, 'observability.timeline')}</Heading></div>
            <HStack gap={2} wrap="wrap">
              <Button label={t(locale, 'observability.revealIp')} variant="ghost" size="sm" isDisabled={!detail?.conversation.ipAvailable} onClick={() => void revealIp()} />
              <Button label={t(locale, 'observability.delete')} variant="ghost" size="sm" onClick={() => void deleteConversation()} />
              <Button label={t(locale, 'observability.close')} variant="ghost" size="sm" onClick={() => { setSelectedId(null); setDetail(null); setRevealedIp(null); }} />
            </HStack>
          </div>
          {detailLoading ? <Text as="p" color="secondary">{t(locale, 'observability.detailLoading')}</Text> : detail && (
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
                {detail.requests.map((request) => <div className="observability-run" key={request.id}><span className={`observability-status status-${request.status}`}>{statusLabel(locale, request.status)}</span><small>{request.durationMs === null ? t(locale, 'observability.latencyUnavailable') : `${request.durationMs} ms`} · {request.totalTokens === null ? t(locale, 'observability.tokensUnavailable') : `${request.totalTokens} tokens`}</small><small>{request.provider ?? t(locale, 'observability.providerUnknown')} / {request.model ?? t(locale, 'observability.modelUnknown')}</small></div>)}
              </aside>
              <div className="observability-timeline">
                {detail.messages.map((message) => <article className={`observability-event role-${message.role}`} key={`${message.role}-${message.id}`}><header><strong>{t(locale, message.role === 'user' ? 'observability.user' : 'observability.assistant')}</strong><time>{formatDate(message.createdAt, locale)}</time>{message.status === 'partial' && <Badge variant="neutral" label={t(locale, 'observability.partial')} />}</header><p>{message.content}</p>{message.sources.length > 0 && <footer>{t(locale, 'observability.sources')}: {message.sources.map((source) => source.name).join(', ')}</footer>}</article>)}
              </div>
            </div>
          )}
        </Card>
      )}
    </VStack>
  );
}

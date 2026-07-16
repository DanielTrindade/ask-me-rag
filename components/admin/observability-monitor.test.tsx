import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ObservabilityMonitor } from '@/components/admin/observability-monitor';

const conversationId = '019b1e62-0d3c-7000-8000-000000000001';
const fetchMock = vi.fn();

const summary = {
  conversations: 1,
  messages: 2,
  requests: 1,
  completed: 1,
  failed: 0,
  aborted: 0,
  averageDurationMs: 420,
  totalTokens: 128,
  devices: [{ name: 'desktop', count: 1 }],
  browsers: [{ name: 'Chrome', count: 1 }],
  lastRetentionAt: '2026-07-13T12:00:00Z',
};

const conversation = {
  id: conversationId,
  startedAt: '2026-07-13T12:00:00Z',
  lastActivityAt: '2026-07-13T12:01:00Z',
  deviceType: 'desktop',
  isBot: false,
  osName: 'Windows',
  osMajor: '11',
  browserName: 'Chrome',
  browserMajor: '126',
  preferredLanguage: 'en-US',
  ipAvailable: true,
  maskedIp: '203.0.113.0/24',
  messageCount: 2,
  requestCount: 1,
  lastStatus: 'completed',
};

function response(payload: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(callback, 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  vi.stubGlobal('confirm', vi.fn(() => true));
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/summary?')) return response({ summary });
    if (url.endsWith('/reveal-ip')) return response({ ip: '203.0.113.42' });
    if (url.endsWith(conversationId) && init?.method === 'DELETE') return response({ deleted: true });
    if (url.endsWith(conversationId)) {
      return response({
        conversation,
        maskedIp: conversation.maskedIp,
        requests: [{
          id: '019b1e62-0d3c-7000-8000-000000000002',
          startedAt: conversation.startedAt,
          completedAt: conversation.lastActivityAt,
          durationMs: 420,
          status: 'completed',
          provider: 'google',
          model: 'gemini',
          totalTokens: 128,
          errorCategory: null,
        }],
        messages: [
          { id: 'u1', role: 'user', content: 'Question', status: 'complete', sources: [], createdAt: conversation.startedAt },
          { id: 'a1', role: 'assistant', content: 'Answer', status: 'complete', sources: [], createdAt: conversation.lastActivityAt },
        ],
      });
    }
    if (url.includes('/conversations?')) return response({ conversations: [conversation], nextCursor: null });
    return response({}, 404);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ObservabilityMonitor', () => {
  it('restores English and switches back to Portuguese with accessible controls', async () => {
    window.localStorage.setItem('chat-locale', 'en');
    const user = userEvent.setup();

    render(<ObservabilityMonitor />);

    expect(await screen.findByRole('heading', { name: 'Chat activity' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Monitor filters' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'EN' }));

    expect(await screen.findByRole('heading', { name: 'Atividade do chat' })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'pt-BR');
  });

  it('inspects a conversation, reveals its IP transiently, and deletes it after confirmation', async () => {
    const user = userEvent.setup();
    render(<ObservabilityMonitor />);

    await user.click(await screen.findByRole('button', { name: 'Inspecionar' }));
    expect(await screen.findByText('Question')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Revelar IP' }));
    expect(await screen.findByText('203.0.113.42')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Excluir conversa' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/admin/observability/conversations/${conversationId}`,
        expect.objectContaining({ method: 'DELETE', cache: 'no-store' }),
      );
    });
    expect(screen.queryByRole('heading', { name: 'Linha do tempo' })).not.toBeInTheDocument();
  });
});

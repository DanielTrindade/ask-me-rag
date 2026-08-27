import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PublicChatRequestError,
  serializePublicChatStatus,
  type PortfolioUIMessage,
} from '@/lib/chat-types';

const mocks = vi.hoisted(() => ({
  options: null as Record<string, unknown> | null,
  messages: [] as PortfolioUIMessage[],
  status: 'ready',
  sendMessage: vi.fn(() => Promise.resolve()),
  regenerate: vi.fn(() => Promise.resolve()),
  setMessages: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('@ai-sdk/react', () => ({
  useChat: (options: Record<string, unknown>) => {
    mocks.options = options;
    return {
      messages: mocks.messages,
      status: mocks.status,
      sendMessage: mocks.sendMessage,
      regenerate: mocks.regenerate,
      setMessages: mocks.setMessages,
      stop: mocks.stop,
    };
  },
}));

vi.mock('ai', () => ({
  DefaultChatTransport: class DefaultChatTransport {
    constructor(readonly options: unknown) {}
  },
}));

vi.mock('@astryxdesign/core/hooks', () => ({
  useMediaQuery: () => false,
}));

import { Chat } from './chat';

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'showPopover', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, 'hidePopover', {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
  vi.stubGlobal('ResizeObserver', class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(callback, 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  window.localStorage.clear();
  window.sessionStorage.clear();
  mocks.options = null;
  mocks.messages = [];
  mocks.status = 'ready';
  mocks.sendMessage.mockReset();
  mocks.sendMessage.mockReturnValue(Promise.resolve());
  mocks.regenerate.mockReset();
  mocks.regenerate.mockReturnValue(Promise.resolve());
  mocks.setMessages.mockReset();
  mocks.stop.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Chat degraded experience', () => {
  it('impede duplo submit síncrono e desabilita o editor durante geração', async () => {
    let resolvePending!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolvePending = resolve;
    });
    mocks.sendMessage.mockReturnValue(pending);
    const user = userEvent.setup();
    const view = render(<Chat />);
    const editor = await screen.findByRole('textbox', { name: 'Mensagem para Daniel' });
    await user.type(editor, 'Projetos?');
    const send = screen.getByRole('button', { name: 'Enviar mensagem' });
    fireEvent.click(send);
    fireEvent.click(send);
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);

    mocks.status = 'streaming';
    view.rerender(<Chat />);
    expect(screen.getByRole('textbox', { name: 'Mensagem para Daniel' }))
      .toHaveAttribute('contenteditable', 'false');
    resolvePending();
    await pending;
  });

  it('exibe limite sem retry e mantém links profissionais acessíveis', async () => {
    mocks.messages = [{
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Projetos?' }],
    }];
    render(<Chat />);

    await act(async () => {
      const onError = mocks.options?.onError as (error: Error) => void;
      onError(new PublicChatRequestError({
        error: 'temporarily_limited',
        message: 'Limite.',
        retryable: false,
      }, 429));
    });

    expect(screen.getAllByText(/limite temporário/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('navigation', { name: 'Links profissionais' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
  });

  it.each([
    ['disabled', false, /temporariamente desativado/i],
    ['temporarily_unavailable', true, /indisponível no momento/i],
  ] as const)('representa %s com retry coerente', async (kind, retryable, copy) => {
    mocks.messages = [{
      id: 'user-provider',
      role: 'user',
      parts: [{ type: 'text', text: 'Experiência?' }],
    }];
    render(<Chat />);

    await act(async () => {
      const onError = mocks.options?.onError as (error: Error) => void;
      onError(new PublicChatRequestError({
        error: kind,
        message: 'Mensagem pública.',
        retryable,
      }, 503));
    });

    expect(screen.getAllByText(copy).length).toBeGreaterThan(0);
    const retry = screen.queryByRole('button', { name: 'Tentar novamente' });
    if (retryable) expect(retry).toBeInTheDocument();
    else expect(retry).not.toBeInTheDocument();
  });

  it('preserva texto parcial, mostra nota separada e repete o mesmo turno', async () => {
    mocks.messages = [{
      id: 'assistant-1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Texto entregue antes da interrupção.' }],
    }];
    const user = userEvent.setup();
    render(<Chat />);

    await act(async () => {
      const onError = mocks.options?.onError as (error: Error) => void;
      onError(new Error(serializePublicChatStatus({ kind: 'partial', retryable: true })));
    });

    expect(screen.getByText('Texto entregue antes da interrupção.')).toBeInTheDocument();
    expect(screen.getAllByText(/texto acima é parcial/i).length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole('button', { name: 'Tentar novamente' })[0]);
    expect(mocks.regenerate).toHaveBeenCalledWith({ messageId: 'assistant-1' });
  });

  it('sinaliza cache hit sem oferecer retry', () => {
    mocks.messages = [{
      id: 'assistant-cache',
      role: 'assistant',
      parts: [
        { type: 'data-chat-status', id: 'public-chat-status', data: {
          kind: 'cache_hit', retryable: false,
        } },
        { type: 'text', text: 'Resposta reutilizada.' },
      ],
    }];
    render(<Chat />);
    expect(screen.getByText(/reutilizada do cache/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
  });

  it('não exibe br literal em resposta do assistente', () => {
    mocks.messages = [{
      id: 'assistant-line-break',
      role: 'assistant',
      parts: [{
        type: 'text',
        text: 'Primeira experiência.<br>Segunda experiência.',
      }],
    }];

    const { container } = render(<Chat />);

    expect(container.querySelectorAll('.assistant-message-bubble br')).toHaveLength(1);
    expect(screen.queryByText(/<br>/)).not.toBeInTheDocument();
  });
});

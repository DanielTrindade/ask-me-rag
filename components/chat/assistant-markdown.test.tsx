import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantMarkdown } from './assistant-markdown';

beforeEach(() => {
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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AssistantMarkdown', () => {
  it.each(['<br>', '<br/>', '<br />', '<BR />'])(
    'renderiza %s como quebra de linha sem exibir a tag',
    (tag) => {
      const { container } = render(
        <AssistantMarkdown>{`Primeira linha${tag}Segunda linha`}</AssistantMarkdown>,
      );

      expect(container.querySelectorAll('br')).toHaveLength(1);
      expect(screen.queryByText(tag)).not.toBeInTheDocument();
      expect(screen.getByText(/Primeira linha/)).toBeInTheDocument();
      expect(screen.getByText(/Segunda linha/)).toBeInTheDocument();
    },
  );

  it('não interpreta outros elementos HTML', () => {
    const { container } = render(
      <AssistantMarkdown>{'<script>alert(1)</script><b>texto</b>'}</AssistantMarkdown>,
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
    expect(screen.getByText(/<b>texto<\/b>/)).toBeInTheDocument();
  });

  it('preserva a sequência dentro de código inline', () => {
    const { container } = render(
      <AssistantMarkdown>{'Use `<br>` somente como exemplo.'}</AssistantMarkdown>,
    );

    expect(container.querySelectorAll('br')).toHaveLength(0);
    expect(screen.getByText('<br>').tagName).toBe('CODE');
  });

  it('preserva a sequência dentro de bloco de código', () => {
    const { container } = render(
      <AssistantMarkdown>{'```html\n<div>texto<br>texto</div>\n```'}</AssistantMarkdown>,
    );

    expect(container.querySelectorAll('br')).toHaveLength(0);
    const code = container.querySelector('code');
    expect(code).not.toBeNull();
    expect(code?.textContent).toContain('<div>texto<br>texto</div>');
  });
});

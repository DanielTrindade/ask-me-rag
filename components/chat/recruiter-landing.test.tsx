import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecruiterLanding } from './recruiter-landing';

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RecruiterLanding', () => {
  it('exibe um deck antes do composer no celular e envia a pergunta escolhida', async () => {
    const onSubmitPrompt = vi.fn();
    const user = userEvent.setup();

    const { container } = render(
      <RecruiterLanding
        locale="pt"
        composer={<div data-testid="composer">Composer</div>}
        isMobile
        onSubmitPrompt={onSubmitPrompt}
      />,
    );

    const suggestions = screen.getByRole('region', { name: 'Perguntas sugeridas' });
    const composer = screen.getByTestId('composer');

    expect(
      suggestions.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.querySelector('.chat-suggestion-deck')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Quais projetos melhor demonstram seu impacto?',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Como é sua experiência com .NET e frontend?',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Resuma sua trajetória e principais competências.',
      }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'Como é sua experiência com .NET e frontend?',
      }),
    );

    expect(onSubmitPrompt).toHaveBeenCalledWith(
      'Como é sua experiência com .NET e frontend?',
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Mostrar pergunta 2: Como é sua experiência com .NET e frontend?',
      }),
    );

    expect(HTMLElement.prototype.scrollTo).toHaveBeenCalled();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('preserva a grade depois do composer em telas maiores', () => {
    render(
      <RecruiterLanding
        locale="pt"
        composer={<div data-testid="composer">Composer</div>}
        isMobile={false}
        onSubmitPrompt={vi.fn()}
      />,
    );

    const suggestions = screen.getByRole('region', { name: 'Perguntas sugeridas' });
    const composer = screen.getByTestId('composer');

    expect(
      composer.compareDocumentPosition(suggestions) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(document.querySelector('.chat-suggestions.astryx-grid')).toBeInTheDocument();
    expect(document.querySelector('.chat-suggestion-deck')).not.toBeInTheDocument();
    expect(screen.queryByText('1 / 3')).not.toBeInTheDocument();
  });
});

import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const router = { replace: vi.fn() };

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));
vi.mock('@/components/ui/toast', () => ({
  useToast: () => vi.fn(),
}));

import { DocumentList } from '@/components/admin/document-list';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      documents: [
        { source: 'cv.pdf', chunkCount: 4, lastIngestedAt: '2026-07-09T12:00:00Z' },
      ],
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('DocumentList', () => {
  it('shows a loading state before the first response', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));

    render(<DocumentList locale="pt" />);

    expect(screen.getByText('Carregando documentos…')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum documento indexado ainda.')).not.toBeInTheDocument();
  });

  it('retries after a loading failure', async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new Error('offline'));

    render(<DocumentList locale="pt" />);

    expect(await screen.findByText('Não foi possível carregar os documentos.')).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ documents: [] }),
    });
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText('Nenhum documento indexado ainda.')).toBeInTheDocument();
  });

  it('lists documents returned by the API', async () => {
    render(<DocumentList locale="pt" />);
    expect(await screen.findByText('cv.pdf')).toBeInTheDocument();
    expect(screen.getByText(/4 trechos/)).toBeInTheDocument();
  });

  it('shows the empty state when there are no documents', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ documents: [] }),
    });
    render(<DocumentList locale="pt" />);
    expect(await screen.findByText('Nenhum documento indexado ainda.')).toBeInTheDocument();
  });

  it('deletes only after inline confirmation', async () => {
    const user = userEvent.setup();
    render(<DocumentList locale="pt" />);
    await screen.findByText('cv.pdf');

    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ deleted: 4 }),
    });
    await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/documents?source=cv.pdf',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });
});

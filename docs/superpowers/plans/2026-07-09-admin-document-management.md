# Admin Document Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin list indexed documents (grouped by source file) and delete a file — all its chunks and embeddings — from the admin panel.

**Architecture:** A new SQL RPC `list_document_sources()` aggregates the `documents` table by `metadata->>'source'`. A new API route `app/api/admin/documents/route.ts` exposes GET (list) and DELETE (by source), both guarded by the existing admin session. A new client component `DocumentList` renders the list with inline delete confirmation; a small client wrapper `AdminSourcesPanel` coordinates refresh between `UploadForm` and `DocumentList` via a `refreshToken` counter.

**Tech Stack:** Next.js 16 (App Router route handlers), Supabase (`@supabase/supabase-js` service client), Vitest + @testing-library/react (jsdom), Astryx design system components, i18n via `lib/i18n.ts`.

**Spec:** `docs/superpowers/specs/2026-07-09-admin-document-management-design.md`

## Global Constraints

- All admin API routes must check `hasAdminSession()` and return `401 { error: 'Unauthorized' }` when absent (same as `app/api/ingest/route.ts`).
- Server errors respond `500 { error: 'internal_error' }` with details only in `console.error` (existing convention).
- UI uses Astryx components only — no raw `<div>` layout; tokens via component props or existing utility classes.
- Every user-facing string goes into `lib/i18n.ts` in BOTH `pt` and `en` dictionaries.
- Delete is permanent and idempotent: deleting an unknown source returns `200 { deleted: 0 }`.
- Tests run with `npm test` (vitest, jsdom, `@` alias = repo root, `server-only` stubbed by `vitest.config.ts`).
- The new SQL must be re-runnable (`create or replace`), matching the style of `supabase/schema.sql`.

---

### Task 1: SQL function `list_document_sources()`

**Files:**
- Modify: `supabase/schema.sql` (append at end)

**Interfaces:**
- Produces: Postgres RPC `list_document_sources()` returning rows `(source text, chunk_count bigint, last_ingested_at timestamptz)`, called later via `supabase.rpc('list_document_sources')`.

There is no automated test for SQL in this repo; the function is exercised through the API route in Task 2 (mocked) and verified manually at the end (see Task 4 final step).

- [ ] **Step 1: Append the function to `supabase/schema.sql`**

Add at the end of the file:

```sql

-- Lists indexed documents grouped by source file, for the admin panel.
create or replace function list_document_sources()
returns table (
  source text,
  chunk_count bigint,
  last_ingested_at timestamptz
)
language sql stable
as $$
  select
    documents.metadata->>'source' as source,
    count(*) as chunk_count,
    max(documents.created_at) as last_ingested_at
  from documents
  group by 1
  order by 3 desc;
$$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add list_document_sources() RPC for admin document listing"
```

> **Deploy note (manual, done by the user at the end):** run this `create or replace function` block once in the Supabase SQL Editor. The API's GET will return 500 until it exists.

---

### Task 2: API route GET/DELETE `/api/admin/documents`

**Files:**
- Create: `app/api/admin/documents/route.ts`
- Test: `app/api/admin/documents/route.test.ts`

**Interfaces:**
- Consumes: `hasAdminSession()` from `@/lib/admin-session`; `getServiceClient()` from `@/lib/supabase`; RPC `list_document_sources` (Task 1).
- Produces:
  - `GET /api/admin/documents` → `200 { documents: Array<{ source: string; chunkCount: number; lastIngestedAt: string | null }> }`
  - `DELETE /api/admin/documents?source=<name>` → `200 { deleted: number }` | `400 { error: 'Missing source' }` | `401` | `500`

- [ ] **Step 1: Write the failing test**

Create `app/api/admin/documents/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hasAdminSession = vi.fn();
vi.mock('@/lib/admin-session', () => ({
  hasAdminSession: () => hasAdminSession(),
}));

const rpc = vi.fn();
const deleteFilter = vi.fn();
const deleteFn = vi.fn(() => ({ filter: deleteFilter }));
const from = vi.fn(() => ({ delete: deleteFn }));
vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => ({ rpc, from }),
}));

import { GET, DELETE } from '@/app/api/admin/documents/route';

function deleteRequest(query: string) {
  return new Request(`http://localhost/api/admin/documents${query}`, { method: 'DELETE' });
}

beforeEach(() => {
  vi.clearAllMocks();
  hasAdminSession.mockResolvedValue(true);
});

describe('GET /api/admin/documents', () => {
  it('returns 401 without an admin session', async () => {
    hasAdminSession.mockResolvedValue(false);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it('maps RPC rows to camelCase documents', async () => {
    rpc.mockResolvedValue({
      data: [{ source: 'cv.md', chunk_count: 4, last_ingested_at: '2026-07-09T12:00:00Z' }],
      error: null,
    });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('list_document_sources');
    expect(await response.json()).toEqual({
      documents: [{ source: 'cv.md', chunkCount: 4, lastIngestedAt: '2026-07-09T12:00:00Z' }],
    });
  });

  it('returns 500 when the RPC fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const response = await GET();
    expect(response.status).toBe(500);
  });
});

describe('DELETE /api/admin/documents', () => {
  it('returns 401 without an admin session', async () => {
    hasAdminSession.mockResolvedValue(false);
    const response = await DELETE(deleteRequest('?source=cv.pdf'));
    expect(response.status).toBe(401);
  });

  it('returns 400 when source is missing or blank', async () => {
    expect((await DELETE(deleteRequest(''))).status).toBe(400);
    expect((await DELETE(deleteRequest('?source=%20'))).status).toBe(400);
  });

  it('deletes by metadata source and reports the count', async () => {
    deleteFilter.mockResolvedValue({ error: null, count: 7 });
    const response = await DELETE(deleteRequest('?source=cv.pdf'));
    expect(response.status).toBe(200);
    expect(deleteFn).toHaveBeenCalledWith({ count: 'exact' });
    expect(deleteFilter).toHaveBeenCalledWith('metadata->>source', 'eq', 'cv.pdf');
    expect(await response.json()).toEqual({ deleted: 7 });
  });

  it('returns 500 when the delete fails', async () => {
    deleteFilter.mockResolvedValue({ error: { message: 'boom' }, count: null });
    const response = await DELETE(deleteRequest('?source=cv.pdf'));
    expect(response.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/admin/documents/route.test.ts`
Expected: FAIL — cannot resolve `@/app/api/admin/documents/route` (file does not exist yet).

- [ ] **Step 3: Write the route**

Create `app/api/admin/documents/route.ts`:

```ts
import { hasAdminSession } from '@/lib/admin-session';
import { getServiceClient } from '@/lib/supabase';

interface SourceRow {
  source: string;
  chunk_count: number;
  last_ingested_at: string | null;
}

export async function GET() {
  if (!(await hasAdminSession())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc('list_document_sources');

  if (error) {
    console.error('[/api/admin/documents] list failed:', error);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }

  const documents = ((data ?? []) as SourceRow[]).map((row) => ({
    source: row.source,
    chunkCount: row.chunk_count,
    lastIngestedAt: row.last_ingested_at,
  }));

  return Response.json({ documents });
}

export async function DELETE(req: Request) {
  if (!(await hasAdminSession())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const source = new URL(req.url).searchParams.get('source')?.trim();
  if (!source) {
    return Response.json({ error: 'Missing source' }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { error, count } = await supabase
    .from('documents')
    .delete({ count: 'exact' })
    .filter('metadata->>source', 'eq', source);

  if (error) {
    console.error('[/api/admin/documents] delete failed:', error);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }

  return Response.json({ deleted: count ?? 0 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/admin/documents/route.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/documents/route.ts app/api/admin/documents/route.test.ts
git commit -m "feat: admin documents API - list sources and delete by source"
```

---

### Task 3: i18n strings + `DocumentList` component

**Files:**
- Modify: `lib/i18n.ts` (add keys to both `pt` and `en` dictionaries, after the `admin.error` key in each)
- Create: `components/admin/document-list.tsx`
- Test: `components/admin/document-list.test.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/documents` and `DELETE /api/admin/documents?source=` (Task 2); `useToast()` from `@/components/ui/toast`; `t(locale, key)` from `@/lib/i18n`.
- Produces: `DocumentList({ locale?: Locale; refreshToken?: number })` — client component; refetches whenever `refreshToken` changes.

- [ ] **Step 1: Add i18n keys**

In `lib/i18n.ts`, insert into the `pt` dictionary (after `'admin.error': 'Falha ao processar',`):

```ts
    'admin.documentsTitle': 'Documentos indexados',
    'admin.documentsBody': 'Arquivos presentes na base. Excluir remove todos os trechos e embeddings do arquivo.',
    'admin.documentsEmpty': 'Nenhum documento indexado ainda.',
    'admin.documentsError': 'Não foi possível carregar os documentos.',
    'admin.documentsChunks': 'trechos',
    'admin.documentsDelete': 'Excluir',
    'admin.documentsConfirm': 'Confirmar exclusão',
    'admin.documentsCancel': 'Cancelar',
    'admin.documentsDeleted': 'Documento excluído.',
    'admin.documentsDeleteError': 'Falha ao excluir o documento.',
```

And into the `en` dictionary (after `'admin.error': 'Processing failed',`):

```ts
    'admin.documentsTitle': 'Indexed documents',
    'admin.documentsBody': 'Files in the knowledge base. Deleting removes all of the file’s chunks and embeddings.',
    'admin.documentsEmpty': 'No documents indexed yet.',
    'admin.documentsError': 'Unable to load documents.',
    'admin.documentsChunks': 'chunks',
    'admin.documentsDelete': 'Delete',
    'admin.documentsConfirm': 'Confirm deletion',
    'admin.documentsCancel': 'Cancel',
    'admin.documentsDeleted': 'Document deleted.',
    'admin.documentsDeleteError': 'Failed to delete the document.',
```

- [ ] **Step 2: Write the failing component test**

Create `components/admin/document-list.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock('@/components/ui/toast', () => ({
  useToast: () => vi.fn(),
}));

import { DocumentList } from '@/components/admin/document-list';

const fetchMock = vi.fn();

beforeEach(() => {
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
    // No DELETE yet — only the initial GET happened.
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
```

Note: `userEvent` comes from `@testing-library/user-event`. If it is not installed (check `package.json`), install it first: `npm install -D @testing-library/user-event`.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run components/admin/document-list.test.tsx`
Expected: FAIL — cannot resolve `@/components/admin/document-list`.

- [ ] **Step 4: Implement the component**

Create `components/admin/document-list.tsx`:

```tsx
'use client';

import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { t, type Locale } from '@/lib/i18n';

interface DocumentSummary {
  source: string;
  chunkCount: number;
  lastIngestedAt: string | null;
}

function formatDate(value: string | null, locale: Locale): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(locale === 'pt' ? 'pt-BR' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function DocumentList({
  locale = 'pt',
  refreshToken = 0,
}: {
  locale?: Locale;
  refreshToken?: number;
}) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/documents');
      if (response.status === 401) {
        router.replace('/admin/login');
        return;
      }
      if (!response.ok) throw new Error('list failed');
      const data = (await response.json()) as { documents: DocumentSummary[] };
      setDocuments(data.documents);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  async function onDelete(source: string) {
    setDeleting(source);
    try {
      const response = await fetch(`/api/admin/documents?source=${encodeURIComponent(source)}`, {
        method: 'DELETE',
      });
      if (response.status === 401) {
        router.replace('/admin/login');
        return;
      }
      if (!response.ok) throw new Error('delete failed');
      toast(t(locale, 'admin.documentsDeleted'));
      await load();
    } catch {
      toast(t(locale, 'admin.documentsDeleteError'));
    } finally {
      setDeleting(null);
      setConfirming(null);
    }
  }

  return (
    <Card padding={6}>
      <VStack gap={5}>
        <VStack gap={2}>
          <Heading level={2}>{t(locale, 'admin.documentsTitle')}</Heading>
          <Text as="p" color="secondary">
            {t(locale, 'admin.documentsBody')}
          </Text>
        </VStack>

        {failed && (
          <Text as="p" color="secondary">
            {t(locale, 'admin.documentsError')}
          </Text>
        )}

        {!failed && documents.length === 0 && (
          <Text as="p" color="secondary">
            {t(locale, 'admin.documentsEmpty')}
          </Text>
        )}

        {documents.map((doc) => (
          <HStack key={doc.source} gap={4} vAlign="center">
            <VStack gap={1} fill>
              <Text type="label" weight="semibold">
                {doc.source}
              </Text>
              <Text type="caption" color="secondary">
                {doc.chunkCount} {t(locale, 'admin.documentsChunks')} · {formatDate(doc.lastIngestedAt, locale)}
              </Text>
            </VStack>
            {confirming === doc.source ? (
              <HStack gap={2}>
                <Button
                  size="sm"
                  variant="ghost"
                  label={t(locale, 'admin.documentsCancel')}
                  isDisabled={deleting === doc.source}
                  onClick={() => setConfirming(null)}
                />
                <Button
                  size="sm"
                  variant="destructive"
                  label={t(locale, 'admin.documentsConfirm')}
                  isLoading={deleting === doc.source}
                  onClick={() => void onDelete(doc.source)}
                />
              </HStack>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                label={t(locale, 'admin.documentsDelete')}
                isDisabled={deleting !== null}
                onClick={() => setConfirming(doc.source)}
              />
            )}
          </HStack>
        ))}
      </VStack>
    </Card>
  );
}
```

Note for the implementer: if `VStack`/`HStack` prop names differ (e.g. `fill`), check with `npx astryx component VStack` / `npx astryx component HStack` and adjust — do not invent props. The `UploadForm` at `components/upload/upload-form.tsx` is the reference for the established usage.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run components/admin/document-list.test.tsx lib/i18n.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/i18n.ts components/admin/document-list.tsx components/admin/document-list.test.tsx package.json package-lock.json
git commit -m "feat: DocumentList admin component with inline delete confirmation"
```

---

### Task 4: Wire into the admin page (refresh coordination)

**Files:**
- Create: `components/admin/admin-sources-panel.tsx`
- Modify: `components/upload/upload-form.tsx` (add `onUploaded` prop)
- Modify: `app/admin/page.tsx` (replace `<UploadForm locale="pt" />` with the panel)

**Interfaces:**
- Consumes: `UploadForm` (existing), `DocumentList` (Task 3).
- Produces: `AdminSourcesPanel({ locale?: Locale })` — client component rendering upload + list; bumps an internal `refreshToken` after successful uploads.

- [ ] **Step 1: Add `onUploaded` callback to `UploadForm`**

In `components/upload/upload-form.tsx`:

Change the signature:

```tsx
export function UploadForm({
  locale = 'pt',
  onUploaded,
}: {
  locale?: Locale;
  onUploaded?: () => void;
}) {
```

And inside `onSubmit`, in the existing `if (succeeded > 0)` block, add the callback:

```tsx
    if (succeeded > 0) {
      toast(`${succeeded} ${succeeded === 1 ? 'documento adicionado' : 'documentos adicionados'}.`);
      setFiles([]);
      onUploaded?.();
    }
```

- [ ] **Step 2: Create the panel wrapper**

Create `components/admin/admin-sources-panel.tsx`:

```tsx
'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';
import { DocumentList } from '@/components/admin/document-list';
import { UploadForm } from '@/components/upload/upload-form';
import type { Locale } from '@/lib/i18n';

export function AdminSourcesPanel({ locale = 'pt' }: { locale?: Locale }) {
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <VStack gap={3}>
      <UploadForm locale={locale} onUploaded={() => setRefreshToken((token) => token + 1)} />
      <DocumentList locale={locale} refreshToken={refreshToken} />
    </VStack>
  );
}
```

- [ ] **Step 3: Use the panel in the admin page**

In `app/admin/page.tsx`, replace the import:

```tsx
import { AdminSourcesPanel } from '@/components/admin/admin-sources-panel';
```

(remove the `UploadForm` import) and replace `<UploadForm locale="pt" />` with:

```tsx
<AdminSourcesPanel locale="pt" />
```

- [ ] **Step 4: Run the full suite, lint, and build**

Run: `npm test`
Expected: all tests PASS.

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add components/admin/admin-sources-panel.tsx components/upload/upload-form.tsx app/admin/page.tsx
git commit -m "feat: document management panel in admin - list and delete sources"
```

- [ ] **Step 6: Manual verification checklist (user-facing)**

1. Run the `list_document_sources()` SQL (Task 1 block) once in the Supabase SQL Editor.
2. Deploy / run the app, log into `/admin`.
3. Confirm the indexed PDF appears with its chunk count.
4. Delete it (button → confirm), verify the toast and that the list updates.
5. Upload the new `.md` and confirm it appears in the list without a page reload.
6. Ask the chat for the LinkedIn/GitHub links and confirm they now resolve.

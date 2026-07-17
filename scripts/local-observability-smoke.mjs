#!/usr/bin/env node

import { randomUUID } from 'node:crypto';

const baseUrl = (process.env.OBSERVABILITY_SMOKE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const adminPassword = process.env.ADMIN_PASSWORD ?? 'local-observability-admin-2026';
const controlledIp = '203.0.113.42';
const conversationId = randomUUID();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(response, category) {
  assert(response.ok, `${category}: HTTP ${response.status}`);
  return response.json();
}

function cookieFrom(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  return values.map((value) => value.split(';', 1)[0]).join('; ');
}

async function main() {
  const chat = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': controlledIp,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0',
      'accept-language': 'pt-BR,pt;q=0.9',
    },
    body: JSON.stringify({
      conversationId,
      messages: [{
        id: `smoke-user-${conversationId}`,
        role: 'user',
        parts: [{ type: 'text', text: 'Verificação local de observabilidade' }],
      }],
    }),
  });
  assert(chat.ok, `chat: HTTP ${chat.status}`);
  await chat.text();

  const login = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseUrl },
    body: JSON.stringify({ password: adminPassword }),
  });
  assert(login.ok, `login: HTTP ${login.status}`);
  const cookie = cookieFrom(login);
  assert(cookie, 'login: cookie administrativo ausente');

  const now = new Date();
  const from = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const query = new URLSearchParams({ from, to: now.toISOString(), ip: controlledIp, limit: '25' });
  const list = await json(await fetch(
    `${baseUrl}/api/admin/observability/conversations?${query}`,
    { headers: { cookie }, cache: 'no-store' },
  ), 'lista');
  assert(list.conversations?.some((item) => item.id === conversationId), 'lista: conversa ou filtro de IP não confirmado');

  const detail = await json(await fetch(
    `${baseUrl}/api/admin/observability/conversations/${conversationId}`,
    { headers: { cookie }, cache: 'no-store' },
  ), 'detalhe');
  assert(detail.messages?.length >= 2, 'detalhe: mensagens do turno não foram persistidas');
  assert(detail.requests?.some((item) => item.status === 'completed'), 'detalhe: execução não foi finalizada');
  assert(detail.maskedIp && detail.maskedIp !== controlledIp, 'detalhe: IP não está mascarado');

  const deletion = await fetch(`${baseUrl}/api/admin/observability/conversations/${conversationId}`, {
    method: 'DELETE',
    headers: { cookie, origin: baseUrl },
    cache: 'no-store',
  });
  assert(deletion.ok, `exclusão: HTTP ${deletion.status}`);

  const afterDeletion = await fetch(`${baseUrl}/api/admin/observability/conversations/${conversationId}`, {
    headers: { cookie },
    cache: 'no-store',
  });
  assert(afterDeletion.status === 404, `exclusão: detalhe posterior retornou HTTP ${afterDeletion.status}`);

  console.log('Smoke local aprovado: captura, IP, dispositivo, consulta, detalhe e exclusão.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

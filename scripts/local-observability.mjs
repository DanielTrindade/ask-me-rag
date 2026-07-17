#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const excludedServices = [
  'realtime',
  'storage-api',
  'imgproxy',
  'mailpit',
  'postgres-meta',
  'studio',
  'edge-runtime',
  'logflare',
  'vector',
  'supavisor',
].join(',');

function run(command, args, { capture = false, env = process.env } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture && result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(' ')} falhou com código ${result.status ?? 'desconhecido'}.`);
  }
  return capture ? result.stdout : '';
}

function supabase(...args) {
  return run(npx, ['supabase', ...args]);
}

function ensureDockerReady() {
  const result = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    timeout: 20_000,
  });
  if (result.error || result.status !== 0 || !result.stdout?.trim()) {
    throw new Error(
      'Docker Desktop não está pronto. Inicie ou reinicie o engine Linux e execute o comando novamente.',
    );
  }
}

function startApiStack() {
  console.log('Reiniciando o projeto local para promover a pilha de banco para a pilha HTTP completa…');
  supabase('stop', '--project-id', 'ask-me-rag', '--no-backup');
  console.log('Iniciando Supabase local mínimo (Postgres, PostgREST, gateway e Auth para credenciais locais)…');
  supabase('start', '--exclude', excludedServices);
}

function resetAndTestDatabase() {
  console.log('Reaplicando todas as migrações locais…');
  supabase('db', 'reset', '--local', '--no-seed');
  console.log('Executando testes SQL e lint do banco…');
  supabase('test', 'db', '--local');
  supabase('db', 'lint', '--local', '--fail-on', 'error');
}

function readLocalStatus() {
  const raw = run(npx, ['supabase', 'status', '-o', 'json'], { capture: true });
  const jsonStart = raw.indexOf('{');
  if (jsonStart < 0) throw new Error('O Supabase não retornou status JSON.');
  const status = JSON.parse(raw.slice(jsonStart));
  const apiUrl = status.API_URL ?? status.api_url ?? status.api?.url;
  const serviceRoleKey = status.SERVICE_ROLE_KEY ?? status.service_role_key ?? status.auth?.service_role_key;
  if (!apiUrl || !serviceRoleKey) {
    throw new Error('O status local não contém API_URL e SERVICE_ROLE_KEY.');
  }
  return { apiUrl, serviceRoleKey };
}

function localEnvironment() {
  const { apiUrl, serviceRoleKey } = readLocalStatus();
  return {
    ...process.env,
    NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? 'local-observability-admin-2026',
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? 'local-development-placeholder',
    CHAT_OBSERVABILITY_ENABLED: 'true',
    CHAT_TRUSTED_PROXY_HOPS: '0',
    CHAT_IP_HMAC_KEY_BASE64: randomBytes(32).toString('base64'),
    CHAT_IP_ENCRYPTION_KEYS_JSON: JSON.stringify({ v1: randomBytes(32).toString('base64') }),
    CHAT_IP_ACTIVE_KEY_VERSION: 'v1',
    CHAT_IP_RETENTION_DAYS: '7',
    CHAT_CONVERSATION_RETENTION_DAYS: '30',
    CHAT_AUDIT_RETENTION_DAYS: '90',
  };
}

function startApplication() {
  rmSync(resolve(root, '.next', 'dev'), { recursive: true, force: true });
  const child = spawn(npm, ['run', 'dev'], {
    cwd: root,
    env: localEnvironment(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  child.on('error', (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
}

const command = process.argv[2] ?? 'dev';

try {
  if (command === 'setup') {
    ensureDockerReady();
    startApiStack();
    resetAndTestDatabase();
    console.log('Ambiente local de observabilidade pronto.');
  } else if (command === 'test') {
    ensureDockerReady();
    console.log('Iniciando somente o Postgres local para CI/testes…');
    supabase('db', 'start');
    resetAndTestDatabase();
  } else if (command === 'dev') {
    ensureDockerReady();
    startApiStack();
    resetAndTestDatabase();
    console.log('Monitor: http://localhost:3000/admin/observability');
    console.log('Senha local: local-observability-admin-2026');
    console.log('Em outro terminal, execute: npm run observability:smoke');
    startApplication();
  } else if (command === 'stop') {
    supabase('stop', '--project-id', 'ask-me-rag');
  } else {
    throw new Error('Uso: node scripts/local-observability.mjs <dev|setup|test|stop>');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

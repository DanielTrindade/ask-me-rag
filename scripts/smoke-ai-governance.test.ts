import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { findDeterministicFaqAnswer } from '@/lib/deterministic-faq';

const describeOnUnix = process.platform === 'win32' ? describe.skip : describe;
const directories: string[] = [];

function fallbackQuestionFromScript() {
  const script = readFileSync(resolve('scripts/smoke-ai-governance.sh'), 'utf8');
  const match = script.match(/^\s*question='([^']+)'\s*$/m);
  if (!match) throw new Error('Pergunta determinística não encontrada no smoke script.');
  return match[1];
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function run(mode: 'fallback' | 'kill-switch') {
  const directory = mkdtempSync(join(tmpdir(), 'ask-me-ai-smoke-'));
  directories.push(directory);
  const mock = join(directory, 'curl.sh');
  const state = join(directory, 'state');
  const chatBody = mode === 'fallback'
    ? 'data: {"type":"text-delta","delta":"Você pode acessar meus links profissionais públicos: [GitHub](https://github.com/DanielTrindade)."}'
    : '{"error":"disabled","retryable":false}';
  writeFileSync(state, `200|{"status":"ok"}\n${mode === 'fallback' ? '200' : '503'}|${chatBody}\n`, 'utf8');
  writeFileSync(mock, `#!/usr/bin/env bash
line="$(head -n 1 "$MOCK_STATE")"
tail -n +2 "$MOCK_STATE" > "$MOCK_STATE.next"
mv "$MOCK_STATE.next" "$MOCK_STATE"
code="${'${line%%|*}'}"
body="${'${line#*|}'}"
output=''
previous=''
for argument in "$@"; do
  if [[ "$previous" == '--output' ]]; then output="$argument"; fi
  previous="$argument"
done
printf '%s' "$body" > "$output"
printf '%s' "$code"
`, 'utf8');
  chmodSync(mock, 0o755);

  return spawnSync('bash', [resolve('scripts/smoke-ai-governance.sh'), 'https://candidate.example'], {
    encoding: 'utf8',
    env: { ...process.env, CURL_BIN: mock, MOCK_STATE: state, AI_SMOKE_MODE: mode },
  });
}

describe('contrato da FAQ usada pelo smoke', () => {
  it('usa uma pergunta realmente reconhecida pela FAQ determinística', () => {
    expect(findDeterministicFaqAnswer(fallbackQuestionFromScript(), 'pt')).toBeTruthy();
  });
});

describeOnUnix('smoke-ai-governance.sh', () => {
  it('valida health e fallback determinístico sem inferência', () => {
    const result = run('fallback');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('health and deterministic fallback');
  });

  it('valida o limite interno por kill switch sem inferência', () => {
    const result = run('kill-switch');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('health and internal kill switch');
  });
});

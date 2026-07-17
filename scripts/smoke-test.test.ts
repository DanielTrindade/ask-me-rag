import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const describeOnUnix = process.platform === 'win32' ? describe.skip : describe;
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function runSmokeTest(codes: string[], extraEnv: Record<string, string | undefined> = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'ask-me-rag-smoke-'));
  temporaryDirectories.push(directory);

  const stateFile = join(directory, 'codes');
  const curlMock = join(directory, 'curl-mock.sh');
  const sleepMock = join(directory, 'sleep-mock.sh');

  writeFileSync(stateFile, `${codes.join('\n')}\n`, 'utf8');
  writeFileSync(
    curlMock,
    `#!/usr/bin/env bash
code="$(head -n 1 "$MOCK_CURL_STATE")"
tail -n +2 "$MOCK_CURL_STATE" > "$MOCK_CURL_STATE.next"
mv "$MOCK_CURL_STATE.next" "$MOCK_CURL_STATE"
printf '%s' "$code"
[[ "$code" != "000" ]]
`,
    'utf8',
  );
  writeFileSync(sleepMock, '#!/usr/bin/env bash\nexit 0\n', 'utf8');
  chmodSync(curlMock, 0o755);
  chmodSync(sleepMock, 0o755);

  return spawnSync('bash', [resolve('scripts/smoke-test.sh'), 'https://candidate.example.run.app'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...extraEnv,
      CURL_BIN: curlMock,
      SLEEP_BIN: sleepMock,
      MOCK_CURL_STATE: stateFile,
      SMOKE_ATTEMPTS: String(codes.length),
      SMOKE_BACKOFF_SECONDS: '0',
    },
  });
}

describeOnUnix('scripts/smoke-test.sh', () => {
  it('retries a transient failure and succeeds', () => {
    const result = runSmokeTest(['503', '200']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Health check passed on attempt 2/2.');
    expect(result.stderr).toContain('attempt 1/2 returned HTTP 503');
  });

  it('fails after the configured attempts without printing a response body', () => {
    const result = runSmokeTest(['000', '503', '503']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Health check failed after 3 attempts.');
    expect(result.stdout).not.toContain('secret');
    expect(result.stderr).not.toContain('secret');
  });

  it('rejects malformed target URLs before calling curl', () => {
    const result = spawnSync('bash', [resolve('scripts/smoke-test.sh'), 'file:///etc/passwd'], {
      encoding: 'utf8',
      env: process.env,
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Invalid service URL.');
  });
});


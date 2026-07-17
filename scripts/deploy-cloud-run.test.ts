import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const describeOnUnix = process.platform === 'win32' ? describe.skip : describe;
const directories: string[] = [];
const sha = 'a'.repeat(40);

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function runDeploy(smokeResults: number[], envOverrides: Record<string, string> = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'ask-me-rag-deploy-'));
  directories.push(directory);
  const calls = join(directory, 'calls');
  const smokeState = join(directory, 'smoke-state');
  const gcloud = join(directory, 'gcloud.sh');
  const curl = join(directory, 'curl.sh');
  const python = join(directory, 'python.sh');
  const smoke = join(directory, 'smoke.sh');

  writeFileSync(calls, '', 'utf8');
  writeFileSync(smokeState, `${smokeResults.join('\n')}\n`, 'utf8');
  writeFileSync(gcloud, `#!/usr/bin/env bash
echo "$*" >> "$CALLS_FILE"
if [[ "$*" == *"services describe"* ]]; then printf '%s' '{}'; fi
`, 'utf8');
  writeFileSync(curl, `#!/usr/bin/env bash\nprintf '%s' '{}'\n`, 'utf8');
  writeFileSync(python, `#!/usr/bin/env bash
code="$2"
cat >/dev/null
if [[ "$code" == *'revisionName'* ]]; then printf '%s' 'ask-me-rag-stable';
elif [[ "$code" == *'os.environ'* ]]; then printf '%s' 'https://candidate.example';
elif [[ "$code" == *'["sha"]'* ]]; then printf '%s' 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
else printf '%s' 'https://public.example'; fi
`, 'utf8');
  writeFileSync(smoke, `#!/usr/bin/env bash
code="$(head -n 1 "$SMOKE_STATE")"
tail -n +2 "$SMOKE_STATE" > "$SMOKE_STATE.next"
mv "$SMOKE_STATE.next" "$SMOKE_STATE"
exit "$code"
`, 'utf8');
  for (const file of [gcloud, curl, python, smoke]) chmodSync(file, 0o755);

  const result = spawnSync('bash', [resolve('scripts/deploy-cloud-run.sh')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GCP_PROJECT_ID: 'ask-me-rag',
      GCP_REGION: 'us-central1',
      CLOUD_RUN_SERVICE: 'ask-me-rag',
      IMAGE_DIGEST: 'repo/image@sha256:1234',
      RUNTIME_SERVICE_ACCOUNT: 'runtime@example.test',
      EXPECTED_GIT_SHA: sha,
      GITHUB_REPOSITORY: 'owner/repo',
      GCLOUD_BIN: gcloud,
      CURL_BIN: curl,
      PYTHON_BIN: python,
      SMOKE_TEST_BIN: smoke,
      CALLS_FILE: calls,
      SMOKE_STATE: smokeState,
      CHAT_OBSERVABILITY_ENABLED: 'true',
      CHAT_TRUSTED_PROXY_HOPS: '1',
      CHAT_IP_HMAC_SECRET: 'ip-hmac-secret',
      CHAT_IP_ENCRYPTION_SECRET: 'ip-encryption-secret',
      ...envOverrides,
    },
  });

  return { result, calls: readFileSync(calls, 'utf8') };
}

describeOnUnix('scripts/deploy-cloud-run.sh', () => {
  it('promotes a healthy candidate', () => {
    const { result, calls } = runDeploy([0, 0]);
    expect(result.status).toBe(0);
    expect(calls).toContain('run deploy ask-me-rag');
    expect(calls).toContain('--update-env-vars=CHAT_OBSERVABILITY_ENABLED=true,CHAT_TRUSTED_PROXY_HOPS=1');
    expect(calls).toContain(
      '--update-secrets=CHAT_IP_HMAC_KEY_BASE64=ip-hmac-secret:latest,CHAT_IP_ENCRYPTION_KEYS_JSON=ip-encryption-secret:latest',
    );
    expect(calls).toContain('--to-revisions=ask-me-rag-sha-aaaaaaaaaaaa=100');
    expect(calls).not.toContain('--to-revisions=ask-me-rag-stable=100');
  });

  it('rejects activation without a verified proxy hop count', () => {
    const { result, calls } = runDeploy([0], { CHAT_TRUSTED_PROXY_HOPS: 'unset' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('CHAT_TRUSTED_PROXY_HOPS');
    expect(calls).toBe('');
  });

  it('does not change traffic when candidate smoke test fails', () => {
    const { result, calls } = runDeploy([1]);
    expect(result.status).toBe(1);
    expect(calls).not.toContain('update-traffic');
  });

  it('restores stable traffic when the public smoke test fails', () => {
    const { result, calls } = runDeploy([0, 1]);
    expect(result.status).toBe(1);
    expect(calls).toContain('--to-revisions=ask-me-rag-sha-aaaaaaaaaaaa=100');
    expect(calls).toContain('--to-revisions=ask-me-rag-stable=100');
  });
});

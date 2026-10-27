import assert from 'node:assert/strict';
import test from 'node:test';
import { Http, retryAfter } from '../src/http.js';
import { fakeFetch, json } from './support.js';

test('retry-after supports dates and seconds, and retries are bounded', async () => {
  const now = Date.parse('2026-10-27T00:00:00Z');
  assert.equal(retryAfter('2', now), 2000);
  assert.equal(retryAfter('Tue, 27 Oct 2026 00:00:03 GMT', now), 3000);
  let calls = 0;
  const http = new Http(fakeFetch(() => { calls++; return json({}, 429, { 'retry-after': '0' }); }), '');
  await assert.rejects(http.json('https://registry.npmjs.org/test', AbortSignal.timeout(1000)), (e: any) => e.code === 'rate_limited');
  assert.equal(calls, 2);
});

test('HTTP 403 without rate-limit evidence is not mislabeled; credentials only go to GitHub', async () => {
  const seen: { host: string; token: string | null; redirect?: RequestRedirect }[] = [];
  const http = new Http(fakeFetch((url, init) => {
    seen.push({ host: url.hostname, token: new Headers(init?.headers).get('authorization'), redirect: init?.redirect });
    return json({}, url.hostname === 'api.github.com' ? 403 : 200);
  }), 'fixture-token');
  await assert.rejects(http.json('https://api.github.com/repos/test/repo', AbortSignal.timeout(1000)), (e: any) => e.code === 'http_error');
  await http.json('https://pypi.org/pypi/test/json', AbortSignal.timeout(1000));
  assert.equal(seen[0]!.token, 'Bearer fixture-token');
  assert.equal(seen[1]!.token, null);
  assert.equal(seen[0]!.redirect, 'error');
  await assert.rejects(http.json('https://example.org/private', AbortSignal.timeout(1000)), /supported public/);
});

test('oversized and invalid registry responses remain explicit failures', async () => {
  const http = new Http(fakeFetch(() => json({ text: 'a'.repeat(2000) })), '');
  await assert.rejects(http.json('https://registry.npmjs.org/test', AbortSignal.timeout(1000), 100), (e: any) => e.code === 'too_large');
  const bad = new Http(fakeFetch(() => new Response('not json')), '');
  await assert.rejects(bad.json('https://registry.npmjs.org/test', AbortSignal.timeout(1000)), (e: any) => e.code === 'unavailable');
});

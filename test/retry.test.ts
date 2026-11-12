import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { ReuseAssistant } from '../src/core.js';
import { Http, SourceError } from '../src/http.js';
import { markdown } from '../src/format.js';
import type { CheckInput } from '../src/types.js';
import { fixture, fakeFetch, json } from './support.js';
import { pagedResponse, searchPage, searchSource } from './pagination-support.js';

const request: CheckInput = { task: 'Find retry_fixture', queries: ['retry_fixture'], sources: ['npm'], useCache: false };

test('retry waits for first-page peers, bounds concurrency and preserves recovered upstream partial state', async t => {
  const order: { source: string; page: number; attempt: number }[] = [];
  const attempts = new Map<string, number>();
  let active = 0, maximum = 0, completedFirst = 0;
  const assistant = new ReuseAssistant(await fixture(t), new Http(fakeFetch(async url => {
    const source = searchSource(url), page = searchPage(url), key = `${source}:${page}`;
    const attempt = (attempts.get(key) ?? 0) + 1;
    attempts.set(key, attempt);
    order.push({ source, page, attempt });
    if (page === 1 && attempt === 2) assert.equal(completedFirst, 5);
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    if (page === 1 && attempt === 1) completedFirst++;
    if (source === 'github' && page === 1 && attempt === 1) return json({}, 503);
    if (source === 'github' && page === 1) return json({ ...await pagedResponse(url).json() as any, incomplete_results: true });
    return pagedResponse(url);
  }), '', ''));
  const sources = ['github', 'npm', 'crates', 'maven', 'gitlab'] as const;
  const report = await assistant.check({ ...request, sources: [...sources], maxPages: 2 });
  assert.equal(report.input.maxRetries, 1);
  assert(maximum <= 4);
  const retryIndex = order.findIndex(o => o.source === 'github' && o.page === 1 && o.attempt === 2);
  assert.equal(retryIndex, sources.length);
  assert(order.slice(0, retryIndex).every(o => o.page === 1 && o.attempt === 1));
  assert(order.slice(retryIndex + 1).every(o => o.page === 2));
  const github = report.sources.find(s => s.source === 'github')!;
  assert.equal(github.status, 'partial');
  assert.equal(github.error, undefined);
  assert.equal(github.pagination?.pagesFetched, 2);
  assert.equal(github.pagination?.itemsFetched, 12);
  assert.equal(github.candidates.length, 12);
  assert.equal(github.failures?.length, 1);
  assert.equal(github.failures?.[0]?.page, 1);
  assert.equal(github.failures?.[0]?.error.status, 503);
  assert.equal(github.failures?.[0]?.retry, 'recovered');
  assert(github.elapsedMs >= 10);
  assert.match(markdown(report), /recovered/);
  const saved = await assistant.store.check(report.id);
  assert.equal(JSON.stringify(saved?.sources.find(s => s.source === 'github')?.failures), JSON.stringify(github.failures));
});

test('continuation retries count successful pages once and retain earlier candidates and both failures', async t => {
  for (const recover of [true, false]) {
    let continuationCalls = 0;
    const assistant = new ReuseAssistant(await fixture(t), new Http(fakeFetch(url => {
      if (searchPage(url) === 1) return pagedResponse(url);
      continuationCalls++;
      return continuationCalls === 1 ? json({}, 503) : recover ? pagedResponse(url) : json({}, 502);
    }), '', ''));
    const input = { ...request, maxPages: 2, useCache: true };
    const report = await assistant.check(input);
    const npm = report.sources.find(s => s.source === 'npm')!;
    assert.equal(continuationCalls, 2);
    assert.equal(npm.candidates.length, recover ? 12 : 6);
    assert.equal(new Set(npm.candidates.map(c => c.id)).size, npm.candidates.length);
    assert.equal(npm.pagination?.pagesFetched, recover ? 2 : 1);
    assert.equal(npm.pagination?.itemsFetched, recover ? 12 : 6);
    assert.equal(npm.failures?.length, 1);
    assert.equal(npm.failures?.[0]?.page, 2);
    assert.equal(npm.failures?.[0]?.error.status, 503);
    assert.equal(npm.failures?.[0]?.retry, recover ? 'recovered' : 'failed');
    if (recover) {
      assert.equal(npm.status, 'ok');
      assert.equal(npm.error, undefined);
      assert.equal(npm.pagination?.failedPage, undefined);
      const cached = await assistant.check(input);
      assert.equal(cached.cached, true);
      assert.equal(JSON.stringify(cached.sources.find(s => s.source === 'npm')?.failures), JSON.stringify(npm.failures));
      assert.equal(continuationCalls, 2);
    } else {
      assert.equal(npm.status, 'partial');
      assert.equal(npm.error?.status, 502);
      assert.equal(npm.failures?.[0]?.retryError?.status, 502);
      assert.equal(npm.pagination?.failedPage, 2);
      assert.equal(npm.pagination?.stopReason, 'error');
    }
  }
});

test('classification retries transient network/timeouts but leaves permanent errors, limits and Retry-After untouched', async t => {
  for (const failure of [
    () => json({}, 401), () => json({}, 403), () => json({}, 404), () => json({}, 400),
    () => json({ objects: 'malformed' }), () => json({}, 429, { 'retry-after': '60' }),
    () => json({}, 503, { 'retry-after': '1' }),
  ]) {
    let calls = 0;
    const assistant = new ReuseAssistant(await fixture(t), new Http(fakeFetch(() => { calls++; return failure(); }), '', ''));
    const report = await assistant.check({ ...request, maxPages: 1 });
    const npm = report.sources.find(s => s.source === 'npm')!;
    assert.equal(calls, 1);
    assert.equal(npm.failures?.length, 1);
    assert.equal(npm.failures?.[0]?.retry, 'not_retried');
    assert(npm.error);
  }
  for (const code of ['unavailable', 'timeout']) {
    let calls = 0;
    class TransientHttp extends Http {
      override async json<T = any>(url: string, parent: AbortSignal, limit?: number): Promise<T> {
        if (++calls === 1) throw new SourceError(code, 'Transient request fixture');
        return super.json<T>(url, parent, limit);
      }
    }
    const assistant = new ReuseAssistant(await fixture(t), new TransientHttp(fakeFetch(url => pagedResponse(url)), '', ''));
    const report = await assistant.check({ ...request, maxPages: 1 });
    const npm = report.sources.find(s => s.source === 'npm')!;
    assert.equal(calls, 2);
    assert.equal(npm.status, 'ok');
    assert.equal(npm.failures?.[0]?.error.code, code);
    assert.equal(npm.failures?.[0]?.retry, 'recovered');
  }
});

test('exhausted parent budget starts no retry and retains completed peer failures', { timeout: 5000 }, async t => {
  const calls: string[] = [];
  const assistant = new ReuseAssistant(await fixture(t), new Http(fakeFetch(url => {
    calls.push(searchSource(url));
    return url.hostname === 'api.github.com' ? new Promise<Response>(() => {}) : json({}, 503);
  }), '', ''));
  const keepAlive = setInterval(() => {}, 2000);
  t.after(() => clearInterval(keepAlive));
  const start = performance.now();
  const report = await assistant.check({ ...request, sources: ['github', 'npm'], budgetMs: 100 });
  assert(performance.now() - start < 2000);
  assert.deepEqual(calls.sort(), ['github', 'npm']);
  for (const source of ['github', 'npm']) assert.equal(report.sources.find(s => s.source === source)?.failures?.[0]?.retry, 'not_retried');
  assert.equal(report.sources.find(s => s.source === 'github')?.error?.code, 'timeout');
  assert.equal(report.sources.find(s => s.source === 'npm')?.error?.status, 503);
});

test('maxRetries validates through core, disables retry and isolates cached policy', async t => {
  const root = await fixture(t);
  let calls = 0;
  const assistant = new ReuseAssistant(root, new Http(fakeFetch(url => { calls++; return pagedResponse(url); }), '', ''));
  const input = { ...request, maxPages: 1, useCache: true };
  const disabled = await assistant.check({ ...input, maxRetries: 0 });
  const enabled = await assistant.check({ ...input, maxRetries: 1 });
  assert.equal(disabled.cached, false);
  assert.equal(enabled.cached, false);
  assert.notEqual(enabled.contextHash, disabled.contextHash);
  assert.equal((await assistant.check(input)).cached, true);
  assert.equal(calls, 2);
  for (const maxRetries of [-1, 2, 0.5, NaN, Infinity]) await assert.rejects(assistant.check({ ...request, maxRetries }), /maxRetries/);
  let failures = 0;
  const failing = new ReuseAssistant(root, new Http(fakeFetch(() => { failures++; return json({}, 503); }), '', ''));
  const report = await failing.check({ ...request, maxPages: 1, maxRetries: 0 });
  assert.equal(failures, 1);
  assert.equal(report.sources.find(s => s.source === 'npm')?.failures?.[0]?.retry, 'not_retried');
});

test('pub retries rejected in-flight corpus and preserves eight-hour disk cache', async t => {
  let calls = 0;
  const assistant = new ReuseAssistant(await fixture(t), new Http(fakeFetch(url => {
    assert.equal(url.pathname, '/api/package-name-completion-data');
    calls++;
    return calls === 1 ? json({}, 503) : json({ packages: ['retry_fixture', 'retry_fixture_extra'] });
  }), '', ''));
  const report = await assistant.check({ ...request, sources: ['pub'], maxPages: 1 });
  const pub = report.sources.find(s => s.source === 'pub')!;
  assert.equal(calls, 2);
  assert.equal(pub.candidates.length, 2);
  assert.equal(pub.failures?.[0]?.retry, 'recovered');
  const next = await assistant.check({ ...request, sources: ['pub'], maxPages: 1 });
  assert.equal(next.cached, false);
  assert.equal(next.sources.find(s => s.source === 'pub')?.candidates.length, 2);
  assert.equal(calls, 2);
});

test('CLI and real MCP stdio expose retry bound and public failure history', async t => {
  const root = await fixture(t);
  const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
  const args = [cli, 'check', '--project', root, '--task', 'Retry input check', '--query', 'fixture', '--scope', 'local', '--json', '--max-retries'];
  const { stdout } = await promisify(execFile)(process.execPath, [...args, '0']);
  assert.equal(JSON.parse(stdout).input.maxRetries, 0);
  await assert.rejects(promisify(execFile)(process.execPath, [...args, '2']));
  const client = new Client({ name: 'retry-acceptance', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('./retry-mcp-server.js', import.meta.url)), root], stderr: 'pipe' });
  t.after(async () => { await client.close(); });
  await client.connect(transport);
  const listing = await client.listTools();
  const schema = listing.tools.find(s => s.name === 'check_reuse')!.inputSchema.properties as any;
  assert.equal(schema.maxRetries.maximum, 1);
  assert.equal(schema.maxRetries.minimum, 0);
  const result: any = await client.callTool({ name: 'check_reuse', arguments: { ...request, maxPages: 1 } });
  assert.notEqual(result.isError, true, result.content?.[0]?.text);
  const report = JSON.parse(result.content[0].text);
  assert.equal(report.input.maxRetries, 1);
  assert.equal(report.sources.find((s: any) => s.source === 'npm').failures[0].retry, 'recovered');
  const disabled: any = await client.callTool({ name: 'check_reuse', arguments: { ...request, queries: ['disabled_fixture'], maxPages: 1, maxRetries: 0 } });
  assert.notEqual(disabled.isError, true);
  assert.equal(JSON.parse(disabled.content[0].text).sources.find((s: any) => s.source === 'npm').failures[0].retry, 'not_retried');
  const bad: any = await client.callTool({ name: 'check_reuse', arguments: { ...request, maxRetries: 2 } });
  assert.equal(bad.isError, true);
});

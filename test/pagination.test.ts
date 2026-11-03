import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { ReuseAssistant } from '../src/core.js';
import { Http } from '../src/http.js';
import { markdown } from '../src/format.js';
import { REMOTE_SOURCES, type CheckInput } from '../src/types.js';
import { fixture, fakeFetch, json } from './support.js';
import { pagedResponse, searchPage, searchSource } from './pagination-support.js';

const sources = REMOTE_SOURCES.filter(s => s !== 'pypi');
const request: CheckInput = { task: 'Find second_page_target', queries: ['second_page_target'], useCache: false };

for (const source of sources) test(`${source} pages through the public core with source-specific offsets and bounded recall`, async t => {
  const seen: URL[] = [];
  const assistant = new ReuseAssistant(await fixture(t), new Http(fakeFetch(url => { seen.push(url); return pagedResponse(url); }), '', ''));
  const report = await assistant.check({ ...request, sources: [source], maxPages: 3 });
  const result = report.sources.find(s => s.source === source)!;
  assert.equal(result.status, 'ok');
  assert.equal(result.pagination?.pagesFetched, 3);
  assert.equal(result.pagination?.stopReason, 'exhausted');
  assert.equal(result.pagination?.hasMore, false);
  assert.equal(result.candidates.length, source === 'rubygems' ? 61 : 13);
  assert.equal(result.pagination?.itemsFetched, result.candidates.length);
  assert(report.candidates.some(c => c.description === 'second_page_target' || (source === 'maven' && c.name.endsWith(':result-6'))));
  const searches = seen.filter(u => u.hostname !== 'api.nuget.org');
  assert.deepEqual(searches.map(searchPage), [1, 2, 3]);
  if (source === 'gitlab') assert(searches.every(u => u.searchParams.get('order_by') === 'id' && u.searchParams.get('sort') === 'asc'));
  if (source === 'rubygems') assert(searches.every(u => !u.searchParams.has('per_page')));
});

test('all first-page jobs finish before continuations; four workers bound concurrency', async t => {
  const order: { source: string; page: number }[] = [];
  let active = 0, maximum = 0;
  const assistant = new ReuseAssistant(await fixture(t), new Http(fakeFetch(async url => {
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    if (url.hostname !== 'api.nuget.org') order.push({ source: searchSource(url), page: searchPage(url) });
    active--;
    return pagedResponse(url);
  }), '', ''));
  const r = await assistant.check({ ...request, maxPages: 2 });
  assert.equal(r.input.maxPages, 2);
  assert(maximum <= 4);
  assert.deepEqual(order.slice(0, sources.length).map(x => x.page), Array(sources.length).fill(1));
  assert.equal(new Set(order.slice(0, sources.length).map(x => x.source)).size, sources.length);
  assert(order.slice(sources.length).every(x => x.page === 2));
  assert(r.sources.filter(s => s.source !== 'local' && s.source !== 'pypi').every(s => s.pagination?.stopReason === 'page_limit' && s.pagination.hasMore));
  assert.match(markdown(r), /2 pages.*page_limit; hasMore=true/);
});

test('continuation throttling retains earlier candidates and Retry-After; partial searches are not cached', async t => {
  const root = await fixture(t);
  let calls = 0;
  const assistant = new ReuseAssistant(root, new Http(fakeFetch(url => {
    calls++;
    return searchPage(url) === 2 ? json({}, 429, { 'retry-after': '60' }) : pagedResponse(url);
  }), '', ''));
  const input: CheckInput = { ...request, sources: ['npm'], useCache: true };
  const r = await assistant.check(input);
  const result = r.sources.find(s => s.source === 'npm')!;
  assert.equal(r.coverage, 'partial');
  assert.equal(result.status, 'partial');
  assert.equal(result.candidates.length, 6);
  assert.equal(result.pagination?.pagesFetched, 1);
  assert.equal(result.pagination?.failedPage, 2);
  assert.equal(result.pagination?.stopReason, 'error');
  assert.equal(result.error?.code, 'rate_limited');
  assert.equal(result.error?.retryAfterMs, 60000);
  assert.match(markdown(r), /failed page=2/);
  await assert.rejects(assistant.decide({ checkId: r.id, choice: 'build_new', rationale: 'Continue despite limited network search coverage', status: 'planned' }), /Acknowledge/);
  assert.equal((await assistant.check(input)).cached, false);
  assert.equal(calls, 4);
});

test('a hung continuation returns within the global deadline and preserves the completed page', async t => {
  const assistant = new ReuseAssistant(await fixture(t), new Http(fakeFetch(url => searchPage(url) === 2 ? new Promise<Response>(() => {}) : pagedResponse(url)), '', ''));
  const start = performance.now();
  const r = await assistant.check({ ...request, sources: ['npm'], maxPages: 3, budgetMs: 100 });
  assert(performance.now() - start < 2000);
  const s = r.sources.find(s => s.source === 'npm')!;
  assert.equal(s.candidates.length, 6);
  assert.equal(s.pagination?.pagesFetched, 1);
  assert.equal(s.pagination?.stopReason, 'budget');
  assert.equal(s.error?.code, 'timeout');
});

test('a repeated page stops with explicit incomplete coverage', async t => {
  const seen: number[] = [];
  const assistant = new ReuseAssistant(await fixture(t), new Http(fakeFetch(url => { seen.push(searchPage(url)); return pagedResponse(url, 1); }), '', ''));
  const r = await assistant.check({ ...request, sources: ['npm'], maxPages: 3 });
  const s = r.sources.find(s => s.source === 'npm')!;
  assert.deepEqual(seen, [1, 2]);
  assert.equal(s.status, 'partial');
  assert.equal(s.candidates.length, 6);
  assert.equal(s.pagination?.itemsFetched, 12);
  assert.equal(s.pagination?.hasMore, true);
  assert.equal(s.pagination?.stopReason, 'no_new_candidates');
});

test('partially overlapping pages retain new IDs and later upstream incomplete flags', async t => {
  const assistant = new ReuseAssistant(await fixture(t), new Http(fakeFetch(async url => {
    const data = await pagedResponse(url).json() as any;
    if (searchPage(url) === 2) { data.items[0].full_name = 'example/result-0'; data.incomplete_results = true; }
    return json(data);
  }), '', ''));
  const r = await assistant.check({ ...request, sources: ['github'], maxPages: 3 });
  const s = r.sources.find(s => s.source === 'github')!;
  assert.equal(s.status, 'partial');
  assert.equal(s.candidates.length, 12);
  assert.equal(new Set(s.candidates.map(c => c.id)).size, 12);
  assert.equal(s.pagination?.pagesFetched, 3);
  assert.equal(s.pagination?.itemsFetched, 13);
  assert.equal(s.pagination?.stopReason, 'exhausted');
  assert(s.notes.some(n => n.includes('GitHub marked this result incomplete')));
});

test('an exhausted first-round budget never starts continuation requests and preserves successful sources', async t => {
  const calls: URL[] = [];
  const assistant = new ReuseAssistant(await fixture(t), new Http(fakeFetch(url => {
    calls.push(url);
    return url.hostname === 'api.github.com' ? new Promise<Response>(() => {}) : pagedResponse(url);
  }), '', ''));
  const r = await assistant.check({ ...request, sources: ['github', 'npm'], budgetMs: 100 });
  assert.equal(calls.length, 2);
  assert(calls.every(u => searchPage(u) === 1));
  assert.equal(r.sources.find(s => s.source === 'github')?.status, 'timeout');
  const npm = r.sources.find(s => s.source === 'npm')!;
  assert.equal(npm.candidates.length, 6);
  assert.equal(npm.pagination?.stopReason, 'budget');
  assert.equal(npm.pagination?.failedPage, 2);
});

test('page limit isolates cached plans; default is two; local and exact lookups do not paginate', async t => {
  let calls = 0;
  const assistant = new ReuseAssistant(await fixture(t), new Http(fakeFetch(url => { calls++; return pagedResponse(url); }), '', ''));
  const input: CheckInput = { ...request, sources: ['npm'], useCache: true, maxPages: 1 };
  const one = await assistant.check(input);
  const oneCached = await assistant.check(input);
  assert.equal(oneCached.cached, true);
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(oneCached.sources.slice(1)), JSON.stringify(one.sources.slice(1)));
  const two = await assistant.check({ ...input, maxPages: undefined });
  assert.equal(two.input.maxPages, 2);
  assert.equal(two.cached, false);
  assert.equal(two.sources[1]?.candidates.length, 12);
  assert.equal(calls, 3);
  await assistant.check({ ...input, scope: 'local', maxPages: 3 });
  assert.equal(calls, 3);
  for (const maxPages of [0, 4, 1.5, NaN, Infinity]) await assert.rejects(assistant.check({ ...input, maxPages }), /maxPages/);
  const lookups: URL[] = [];
  const exact = new ReuseAssistant(await fixture(t), new Http(fakeFetch(url => {
    lookups.push(url);
    return url.hostname === 'pypi.org' ? json({ info: { name: 'known', version: '1.0.0' } }) : json({ visibility: 'public', path_with_namespace: 'g/p', web_url: 'https://gitlab.com/g/p' });
  }), '', ''));
  const r = await exact.check({ ...request, queries: ['https://gitlab.com/g/p'], sources: ['gitlab', 'pypi'], packageNames: ['known'], maxPages: 3 });
  assert.equal(lookups.length, 2);
  assert.equal(r.sources.find(s => s.source === 'gitlab')?.pagination?.stopReason, 'lookup');
});

test('empty, malformed and shortened later pages preserve the actual plan and earlier evidence', async t => {
  for (const continuation of [json({ objects: [], total: 6 }), json({ objects: 'broken' }), json({ objects: Array(7).fill({ package: { name: 'invalid' } }) })]) {
    const assistant = new ReuseAssistant(await fixture(t), new Http(fakeFetch(url => searchPage(url) === 1 ? pagedResponse(url) : continuation.clone()), '', ''));
    const r = await assistant.check({ ...request, sources: ['npm'], queries: ['query '.repeat(30)] });
    const s = r.sources.find(s => s.source === 'npm')!;
    assert.equal(s.status, 'partial');
    assert.equal(s.candidates.length, 6);
    assert(s.effectiveQuery!.length <= 64);
    assert.equal(s.pagination?.pagesFetched, s.error ? 1 : 2);
    if (s.error) assert.equal(s.error.code, 'invalid_response');
  }
});

test('real MCP exposes and validates maxPages, returning pagination through stdio', async t => {
  const root = await fixture(t);
  const client = new Client({ name: 'pagination-acceptance', version: '0.3.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('./pagination-mcp-server.js', import.meta.url)), root], stderr: 'pipe' });
  t.after(async () => { await client.close(); });
  await client.connect(transport);
  const listing = await client.listTools();
  assert.equal((listing.tools.find(s => s.name === 'check_reuse')!.inputSchema.properties as any).maxPages.maximum, 3);
  const result: any = await client.callTool({ name: 'check_reuse', arguments: { ...request, sources: ['npm'], maxPages: 3 } });
  assert.notEqual(result.isError, true);
  const report = JSON.parse(result.content[0].text);
  assert.equal(report.sources[1].pagination.pagesFetched, 3);
  assert.equal(report.sources[1].candidates.length, 13);
  assert.equal(report.sources[1].pagination.stopReason, 'exhausted');
  const inspected: any = await client.callTool({ name: 'inspect_candidate', arguments: { checkId: report.id, candidateId: 'npm:result-6' } });
  assert.notEqual(inspected.isError, true);
  const evidence = JSON.parse(inspected.content[0].text);
  assert.equal(evidence.metadata.registry.name, 'result-6');
  const decision = { checkId: report.id, choice: 'adopt_dependency', candidateIds: ['npm:result-6'], evidenceIds: [evidence.id], acknowledgeIncomplete: true, rationale: 'Second-page fixture candidate matches the target; metadata-only evidence is explicitly acknowledged' };
  let previousDecisionId: string | undefined;
  for (const status of ['planned', 'applied', 'verified']) {
    const recorded: any = await client.callTool({ name: 'record_decision', arguments: { ...decision, status, previousDecisionId, ...(status === 'verified' ? { validation: 'Host-reported protocol fixture verification only; no dependency is installed by the test' } : {}) } });
    assert.notEqual(recorded.isError, true, recorded.content?.[0]?.text);
    previousDecisionId = JSON.parse(recorded.content[0].text).id;
  }
  const bad: any = await client.callTool({ name: 'check_reuse', arguments: { ...request, maxPages: 4 } });
  assert.equal(bad.isError, true);
});

test('CLI accepts max-pages and rejects values outside the public bound', async t => {
  const root = await fixture(t);
  const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
  const args = [cli, 'check', '--project', root, '--task', 'Local pagination check', '--query', 'fixture', '--scope', 'local', '--json', '--max-pages'];
  const { stdout } = await promisify(execFile)(process.execPath, [...args, '3']);
  assert.equal(JSON.parse(stdout).input.maxPages, 3);
  await assert.rejects(promisify(execFile)(process.execPath, [...args, '0']));
});

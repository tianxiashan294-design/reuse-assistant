import assert from 'node:assert/strict';
import test from 'node:test';
import { unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ReuseAssistant } from '../src/core.js';
import { Http } from '../src/http.js';
import { fixture, fakeFetch, json, repo, githubEvidence, SHA } from './support.js';
import { markdown } from '../src/format.js';

test('existing local implementation can be inspected, selected and actually verified', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'scheduler.ts'), 'export const scheduleTask = (fn: () => void) => setTimeout(fn, 10);');
  const assistant = new ReuseAssistant(root, new Http(fakeFetch(() => { throw new Error('Local scope must not fetch'); })));
  const report = await assistant.check({ task: 'Reuse scheduleTask', queries: ['scheduleTask'], scope: 'local' });
  assert.equal(report.coverage, 'complete');
  const candidate = report.candidates.find(c => c.localPath === 'scheduler.ts')!;
  assert(candidate);
  await assert.rejects(assistant.decide({ checkId: report.id, choice: 'reuse_local', status: 'planned', rationale: 'Reuse the existing scheduler implementation', candidateIds: [candidate.id] }), /Inspect/);
  const inspected = await assistant.inspect(report.id, candidate.id);
  assert.match(inspected.files[0]!.content, /scheduleTask/);
  const planned = await assistant.decide({ checkId: report.id, choice: 'reuse_local', status: 'planned', rationale: 'Existing scheduler satisfies the callback timing requirement', candidateIds: [candidate.id], evidenceIds: [inspected.id] });
  const applied = await assistant.decide({ ...planned, status: 'applied', previousDecisionId: planned.id });
  const verified = await assistant.decide({ ...applied, status: 'verified', previousDecisionId: applied.id, validation: 'node --test: existing scheduler fixture behavior verified' });
  assert.equal(verified.status, 'verified');
  const latest = await assistant.store.latestDecision(report.id);
  assert.equal(latest!.id, verified.id);
  const rendered = markdown(report, latest);
  assert.match(rendered, /Decision: verified/);
  assert.match(rendered, /Host-reported validation/);
  assert(!rendered.includes('record a planned decision before implementation'));
  await unlink(path.join(root, '.reuse-assistant/decision-index', `${report.id}.json`));
  const recovered = await assistant.store.latestDecision(report.id);
  assert.equal(recovered!.id, verified.id);
  assert.match(markdown(report, recovered), /Decision: verified/);
});

test('small projects remain discoverable; same repository merges packages without inventing a repo version', async t => {
  const root = await fixture(t);
  let githubQuery = '';
  const http = new Http(fakeFetch(url => {
    if (url.hostname === 'api.github.com') { githubQuery = url.searchParams.get('q')!; return json({ items: [repo], incomplete_results: false }); }
    return json({ objects: [{ package: { name: 'tiny-scheduler', version: '2.0.0', description: 'background scheduler', links: { repository: 'git+https://github.com/tiny/scheduler.git' } } }] });
  }), '');
  const report = await new ReuseAssistant(root, http).check({ task: 'Find a background scheduler', queries: ['background scheduler'], sources: ['github', 'npm'], useCache: false });
  assert(!githubQuery.includes('stars:'));
  const candidate = report.candidates.find(c => c.source !== 'local')!;
  assert.equal(candidate.stars, 2);
  assert.equal(candidate.version, undefined);
  assert.deepEqual(candidate.sources, ['github', 'npm']);
  assert.equal(candidate.packages![0]!.version, '2.0.0');
});

test('rate limits remain distinct from successful zero results and require acknowledged degradation', async t => {
  const root = await fixture(t);
  const assistant = new ReuseAssistant(root, new Http(fakeFetch(url => url.hostname === 'api.github.com'
    ? json({}, 403, { 'x-ratelimit-remaining': '0', 'retry-after': '30' }) : json({ objects: [] })), ''));
  const report = await assistant.check({ task: 'Implement background jobs', queries: ['background jobs'], sources: ['github', 'npm'], useCache: false });
  assert.equal(report.sources.find(s => s.source === 'github')!.status, 'rate_limited');
  assert.equal(report.sources.find(s => s.source === 'npm')!.status, 'empty');
  assert.equal(report.coverage, 'partial');
  const choice = { checkId: report.id, choice: 'incomplete_continue' as const, status: 'planned' as const, rationale: 'GitHub is rate limited; continue with available local evidence' };
  await assert.rejects(assistant.decide(choice), /Acknowledge/);
  assert.equal((await assistant.decide({ ...choice, acknowledgeIncomplete: true })).choice, 'incomplete_continue');
});

test('global deadline bounds a transport that ignores AbortSignal', { timeout: 5000 }, async t => {
  const root = await fixture(t);
  const assistant = new ReuseAssistant(root, new Http(fakeFetch(() => new Promise<Response>(() => {})), ''));
  const start = performance.now();
  // Keep the test runner alive while Node's unref'ed AbortSignal timer fires.
  const keepAlive = setInterval(() => {}, 2000);
  try {
    const report = await assistant.check({ task: 'Find bounded requests', queries: ['request retry'], budgetMs: 100, useCache: false });
    assert(performance.now() - start < 2000);
    assert.equal(report.sources.filter(s => s.status === 'timeout').length, 8);
    assert.equal(report.coverage, 'partial');
  } finally { clearInterval(keepAlive); }
});

test('cache annotates remote reuse while local changes are searched freshly; constraints invalidate it', async t => {
  const root = await fixture(t);
  let calls = 0;
  const assistant = new ReuseAssistant(root, new Http(fakeFetch(url => { calls++; return json(url.hostname === 'api.github.com' ? { items: [], incomplete_results: false } : { objects: [] }); }), ''));
  const request = { task: 'Implement scheduleTask', queries: ['scheduleTask'], sources: ['github', 'npm'] as ('github' | 'npm')[] };
  await assistant.check(request);
  const initial = calls;
  await writeFile(path.join(root, 'existing.ts'), 'export const scheduleTask = () => 1;');
  const cached = await assistant.check(request);
  assert.equal(calls, initial);
  assert.equal(cached.cached, true);
  assert(cached.cacheCreatedAt);
  assert(cached.candidates.some(c => c.localPath === 'existing.ts'));
  await assistant.check({ ...request, constraints: ['persistent jobs'] });
  assert(calls > initial);
});

test('a changed dependency manifest invalidates a new plan but linked implementation can change it', async t => {
  const root = await fixture(t);
  const assistant = new ReuseAssistant(root);
  const request = { task: 'Use built-in argument parsing', queries: ['parseArgs'], scope: 'local' as const };
  const report = await assistant.check(request);
  const choice = { checkId: report.id, choice: 'build_new' as const, status: 'planned' as const, rationale: 'Built-in parseArgs meets these simple CLI requirements with no new dependency' };
  const planned = await assistant.decide(choice);
  await writeFile(path.join(root, 'package.json'), '{"name":"fixture","version":"1.1.0"}');
  await assert.rejects(assistant.decide(choice), /context changed/);
  const applied = await assistant.decide({ ...choice, status: 'applied', previousDecisionId: planned.id });
  await assert.rejects(assistant.decide({ ...choice, status: 'verified', previousDecisionId: applied.id }), /validation/);
  const verified = await assistant.decide({ ...choice, status: 'verified', previousDecisionId: applied.id, validation: 'node --test: parser acceptance fixtures passed' });
  assert.notEqual(verified.resultingFingerprint, planned.resultingFingerprint);
});

test('code inspection pins commits, supports line ranges and verifies Python distribution association', async t => {
  const root = await fixture(t);
  const assistant = new ReuseAssistant(root, new Http(fakeFetch(url => {
    if (url.pathname === '/search/repositories') return json({ items: [repo], incomplete_results: false });
    const evidence = githubEvidence(url);
    if (evidence) return evidence;
    throw new Error(`Unexpected fixture URL ${url.pathname}`);
  }), ''));
  const report = await assistant.check({ task: 'Adapt background scheduler design', queries: ['background scheduler'], ecosystem: 'python', sources: ['github', 'pypi'], useCache: false });
  assert.equal(report.sources.find(s => s.source === 'pypi')!.status, 'skipped');
  const candidate = report.candidates.find(c => c.id === 'github:tiny/scheduler')!;
  const inspected = await assistant.inspect(report.id, candidate.id, ['src/scheduler.py#L20-L25']);
  const code = inspected.files.find(f => f.path.endsWith('.py'))!;
  assert.equal(code.ref, SHA);
  assert.equal(code.startLine, 20);
  assert.equal(code.endLine, 25);
  assert.equal(code.content.split('\n').length, 6);
  assert.match(code.content, /code line 20/);
  assert.equal((inspected.metadata.pythonDistributions as any[])[0].repositoryConfirmed, true);
  await assert.rejects(assistant.decide({ checkId: report.id, choice: 'adapt_code', rationale: 'Adapt the existing implementation with its documented license', candidateIds: [candidate.id], status: 'planned' }), /Inspect/);
  const decision = await assistant.decide({ checkId: report.id, choice: 'adapt_code', rationale: 'Adapt the inspected scheduling code; MIT is identified and persistence matches', candidateIds: [candidate.id], evidenceIds: [inspected.id], status: 'planned' });
  assert.equal(decision.choice, 'adapt_code');
});

test('unknown evidence and out-of-check candidates cannot support adoption', async t => {
  const root = await fixture(t);
  const assistant = new ReuseAssistant(root);
  const report = await assistant.check({ task: 'Investigate an implementation', queries: ['nonexistentfeature'], scope: 'local' });
  await assert.rejects(assistant.decide({ checkId: report.id, choice: 'adopt_dependency', rationale: 'Try to cite an unrelated candidate as an existing solution', candidateIds: ['npm:invented'], status: 'planned' }), /outside/);
  await assert.rejects(assistant.decide({ checkId: report.id, choice: 'build_new', rationale: 'There is a genuine gap in the requirements', evidenceIds: ['made-up'], status: 'planned' }), /outside/);
});

test('Chinese two-character terms remain usable and scoped npm names do not become invalid GitHub queries', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'retry.ts'), '// 重试现有请求\nexport const retry = true;');
  const seen: string[] = [];
  const assistant = new ReuseAssistant(root, new Http(fakeFetch(url => { seen.push(url.hostname); return json({ objects: [] }); }), ''));
  const local = await assistant.check({ task: '增加重试', queries: ['重试'], scope: 'local' });
  assert(local.candidates.some(c => c.localPath === 'retry.ts'));
  assert.equal(local.input.queries[0], '重试');
  await assistant.check({ task: 'Use the official MCP server package', queries: ['@modelcontextprotocol/server'], useCache: false });
  assert.deepEqual(seen, ['registry.npmjs.org']);
});

test('many local matches cannot crowd every external candidate out of the shortlist', async t => {
  const root = await fixture(t);
  for (let i = 0; i < 35; i++) await writeFile(path.join(root, `scheduler-${i}.ts`), 'export const scheduler = true;');
  const assistant = new ReuseAssistant(root, new Http(fakeFetch(url => url.hostname === 'api.github.com' ? json({ items: [repo] }) : json({ objects: [] })), ''));
  const report = await assistant.check({ task: 'Find scheduler implementations', queries: ['scheduler'], sources: ['github', 'npm'], useCache: false });
  assert.equal(report.candidates.filter(c => c.source === 'local').length, 8);
  assert(report.candidates.some(c => c.id === 'github:tiny/scheduler'));
  assert.equal(report.sources[0]!.status, 'partial');
});

test('package alias inspection selects the correct published version in a multi-package repository', async t => {
  const root = await fixture(t);
  const assistant = new ReuseAssistant(root, new Http(fakeFetch(url => {
    if (url.pathname === '/search/repositories') return json({ items: [repo] });
    if (url.pathname === '/-/v1/search') return json({ objects: [{ package: { name: '@tiny/server', version: '2.0.0', links: { repository: 'https://github.com/tiny/scheduler' } } }] });
    if (url.hostname === 'registry.npmjs.org' && url.pathname === '/%40tiny%2Fserver/2.0.0') return json({ name: '@tiny/server', version: '2.0.0', license: 'MIT', gitHead: SHA, repository: { url: 'https://github.com/tiny/scheduler' } });
    const response = githubEvidence(url);
    if (response) return response;
    throw new Error(`Unexpected fixture URL ${url.href}`);
  }), ''));
  const report = await assistant.check({ task: 'Use server package', queries: ['scheduler'], sources: ['github', 'npm'], useCache: false });
  const inspection = await assistant.inspect(report.id, 'npm:@tiny/server');
  assert.equal((inspection.metadata.registry as any).version, '2.0.0');
  assert.equal(inspection.metadata.codeVersionAssociation, 'npm gitHead');
  assert.equal(inspection.candidateId, 'github:tiny/scheduler');
});

test('registry-specific query limits preserve returned results and expose shortened coverage', async t => {
  const root = await fixture(t);
  const lengths: Record<string, number> = {};
  const assistant = new ReuseAssistant(root, new Http(fakeFetch(url => {
    if (url.hostname === 'api.github.com') { lengths.github = url.searchParams.get('q')!.length; return json({ items: [repo] }); }
    lengths.npm = url.searchParams.get('text')!.length;
    return json({ objects: [] });
  }), ''));
  const original = 'HTTP request retry 429 5xx exponential backoff injectable sleep JavaScript '.repeat(4).slice(0, 295);
  const report = await assistant.check({ task: 'Find request retry implementations', queries: [original], sources: ['github', 'npm'], useCache: false });
  assert(lengths.github! <= 256);
  assert(lengths.npm! <= 64);
  assert(report.candidates.some(c => c.id === 'github:tiny/scheduler'));
  assert.equal(report.sources.find(s => s.source === 'npm')!.status, 'partial');
  assert.equal(report.sources.find(s => s.source === 'npm')!.query, original);
  assert(report.sources.find(s => s.source === 'npm')!.effectiveQuery!.length <= 64);
  assert.equal(report.coverage, 'partial');
});

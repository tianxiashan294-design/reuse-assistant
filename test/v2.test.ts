import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { ReuseAssistant } from '../src/core.js';
import { Http } from '../src/http.js';
import { REMOTE_SOURCES, type CheckInput, type RemoteSource } from '../src/types.js';
import { markdown } from '../src/format.js';
import { fixture, fakeFetch, githubEvidence, json, repo, SHA } from './support.js';
import { GL, v2Fetch, v2Response } from './v2-support.js';

test('auto queries every implemented source, preserves aliases and exposes finite coverage through the core', async t => {
  const root = await fixture(t);
  const assistant = new ReuseAssistant(root, new Http(v2Fetch(), '', ''));
  const report = await assistant.check({ task: '发现多语言 scheduler', queries: ['scheduler'], packageNames: ['APScheduler'], useCache: false });
  assert.equal(report.coverage, 'complete');
  assert.deepEqual(new Set(report.sources.slice(1).map(s => s.source)), new Set(REMOTE_SOURCES));
  assert.equal(report.sourcePlan?.filter(p => p.selected).length, REMOTE_SOURCES.length);
  const merged = report.candidates.find(c => c.id === `gitlab:${GL}`)!;
  assert(merged.aliases?.includes('crates:scheduler'));
  assert.equal(merged.version, undefined);
  assert.equal(merged.packages?.[0]?.version, '1.2.3');
  assert.match(markdown(report), /pypi: selected; name_verification/);
  assert.match(markdown(report), /not exhaustive/);
});

test('explicit sources override ecosystems, isolate caches and never bypass local scope', async t => {
  const root = await fixture(t);
  const seen: string[] = [];
  const assistant = new ReuseAssistant(root, new Http(fakeFetch(url => { seen.push(url.hostname); return v2Response(url); }), '', ''));
  const input: CheckInput = { task: 'Find scheduler', queries: ['scheduler'], ecosystem: 'python', sources: ['crates', 'crates'] };
  const first = await assistant.check(input);
  assert.deepEqual(first.input.sources, ['crates']);
  assert.deepEqual(seen, ['crates.io']);
  assert.equal((await assistant.check(input)).cached, true);
  const other = await assistant.check({ ...input, sources: ['rubygems'] });
  assert.equal(other.cached, false);
  assert(seen.includes('rubygems.org'));
  const before = seen.length;
  const local = await assistant.check({ ...input, scope: 'local' });
  assert.equal(seen.length, before);
  assert.equal(local.sourcePlan?.some(p => p.selected), false);
  await assert.rejects(assistant.check({ ...input, sources: [] }), /nonempty sources/);
  await assert.rejects(assistant.check({ ...input, sources: ['invented'] as unknown as RemoteSource[] }), /supported/);
  await assert.rejects(assistant.check({ ...input, packageNames: ['APScheduler'] }), /include pypi/);
});

test('ecosystem routing retains both repository platforms and the matching package registry', async t => {
  const root = await fixture(t);
  const assistant = new ReuseAssistant(root, new Http(v2Fetch(), '', ''));
  const routes = { javascript: 'npm', python: 'pypi', rust: 'crates', java: 'maven', dotnet: 'nuget', ruby: 'rubygems', php: 'packagist', go: undefined } as const;
  for (const [ecosystem, registry] of Object.entries(routes)) {
    const r = await assistant.check({ task: 'Find scheduler', queries: ['scheduler'], ecosystem: ecosystem as CheckInput['ecosystem'], useCache: false });
    assert.deepEqual(new Set(r.input.sources), new Set(['github', 'gitlab', ...(registry ? [registry] : [])]));
  }
});

for (const [source, id, version] of [
  ['crates', 'crates:scheduler', '1.2.3'], ['maven', 'maven:org.example:scheduler', '2.0.0'],
  ['nuget', 'nuget:Scheduler', '3.0.0'], ['rubygems', 'rubygems:scheduler', '4.0.0'],
  ['packagist', 'packagist:example/scheduler', '10.0.0'],
] as const) {
  test(`${source} public check -> inspect retains the selected published version and evidence gaps`, async t => {
    const root = await fixture(t);
    const assistant = new ReuseAssistant(root, new Http(v2Fetch(), '', ''));
    const report = await assistant.check({ task: 'Find scheduler package', queries: ['scheduler'], sources: [source], useCache: false });
    const inspected = await assistant.inspect(report.id, id);
    assert.equal((inspected.metadata.registry as any).version, version);
    assert(inspected.files.some(f => f.ref === version));
    if (source === 'crates') assert.equal(inspected.metadata.ref, SHA);
    else {
      assert.equal(inspected.status, 'partial');
      assert.match(inspected.notes.join(' '), /no supported GitHub\/GitLab/);
    }
    if (source === 'maven') assert(inspected.files.some(f => f.path === 'PUBLISHED.pom' && f.content.includes('Apache-2.0')));
    const choice = { checkId: report.id, choice: 'adopt_dependency' as const, status: 'planned' as const, candidateIds: [id], evidenceIds: [inspected.id], rationale: 'Published package meets the scheduling interface; source association gaps are explicitly accepted for review' };
    if (inspected.status === 'partial') await assert.rejects(assistant.decide(choice), /incomplete candidate evidence/);
    assert.equal((await assistant.decide({ ...choice, acknowledgeIncomplete: true })).status, 'planned');
  });
}

test('GitLab nested projects pin files and directories to a commit and support code ranges and package aliases', async t => {
  const root = await fixture(t);
  const seen: URL[] = [];
  const assistant = new ReuseAssistant(root, new Http(fakeFetch(url => { seen.push(url); return v2Response(url); }), '', ''));
  const report = await assistant.check({ task: 'Read scheduler code', queries: ['scheduler'], sources: ['gitlab', 'crates'], useCache: false });
  const inspection = await assistant.inspect(report.id, 'crates:scheduler', ['src/job.zig#L2-L3', 'src']);
  assert.equal(inspection.candidateId, `gitlab:${GL}`);
  assert.equal(inspection.status, 'complete');
  assert.equal(inspection.metadata.ref, SHA);
  assert.match(String(inspection.metadata.codeVersionAssociation), /unverified/);
  assert.equal(inspection.files.find(f => f.path === 'src/job.zig')?.content, 'line 2\nline 3');
  assert.deepEqual((inspection.metadata.directories as any).src, [{ path: 'src/job.zig', type: 'file' }]);
  assert(seen.filter(u => /\/repository\/(?:tree|files)\b/.test(u.pathname)).every(u => u.searchParams.get('ref') === SHA));
  assert(inspection.files.every(f => f.path.includes('METADATA') || f.ref === SHA));
  const bad = await assistant.inspect(report.id, 'crates:scheduler', ['../outside.zig']);
  assert.equal(bad.status, 'partial');
  assert.match(bad.errors.join(' '), /relative/);
});

test('same repository path on different platforms remains distinct; package aliases do not invent versions', async t => {
  const root = await fixture(t);
  const assistant = new ReuseAssistant(root, new Http(fakeFetch(url => url.hostname === 'api.github.com' ? json({ items: [{ ...repo, full_name: 'group/scheduler' }] }) : json([{ path_with_namespace: 'group/scheduler', web_url: 'https://gitlab.com/group/scheduler' }])), '', ''));
  const report = await assistant.check({ task: 'Find scheduler', queries: ['scheduler'], sources: ['github', 'gitlab'] });
  assert(report.candidates.some(c => c.id === 'github:group/scheduler'));
  assert(report.candidates.some(c => c.id === 'gitlab:group/scheduler'));
});

test('exact GitLab URLs use public project lookup and cannot expose a token-accessible private project', async t => {
  const root = await fixture(t);
  let visibility = 'public';
  const assistant = new ReuseAssistant(root, new Http(fakeFetch(url => {
    assert.equal(decodeURIComponent(url.pathname), `/api/v4/projects/${GL}`);
    assert.equal(url.searchParams.has('search'), false);
    return json({ path_with_namespace: GL, web_url: `https://gitlab.com/${GL}`, visibility });
  }), '', 'token-fixture'));
  const input: CheckInput = { task: 'Find scheduler', queries: [`https://gitlab.com/${GL}`], sources: ['gitlab'], useCache: false };
  assert((await assistant.check(input)).candidates.some(c => c.id === `gitlab:${GL}`));
  visibility = 'private';
  assert.equal((await assistant.check(input)).candidates.filter(c => c.source !== 'local').length, 0);
});

test('new-source failures stay distinct and results survive a deadline with more jobs than workers', { timeout: 5000 }, async t => {
  const root = await fixture(t);
  const assistant = new ReuseAssistant(root, new Http(fakeFetch(url => {
    if (url.hostname === 'gitlab.com') return json({}, 403);
    if (url.hostname === 'crates.io') return json({}, 429, { 'retry-after': '20' });
    if (url.hostname === 'search.maven.org') return json({ response: {} });
    if (url.hostname === 'rubygems.org') return new Promise<Response>(() => {});
    return v2Response(url);
  }), '', ''));
  const keepAlive = setInterval(() => {}, 1000);
  try {
    const report = await assistant.check({ task: 'Find scheduler', queries: ['scheduler', 'json'], budgetMs: 100, useCache: false });
    assert.equal(report.coverage, 'partial');
    assert.equal(report.sources.find(s => s.source === 'gitlab')?.error?.status, 403);
    assert.equal(report.sources.find(s => s.source === 'crates')?.status, 'rate_limited');
    assert.equal(report.sources.find(s => s.source === 'maven')?.error?.code, 'invalid_response');
    assert(report.sources.some(s => s.status === 'timeout'));
    assert(report.candidates.some(c => c.source === 'nuget' || c.source === 'packagist'));
    const decision = { checkId: report.id, choice: 'build_new' as const, status: 'planned' as const, rationale: 'Proceed with known gaps after source failures, without treating outages as zero results' };
    await assert.rejects(assistant.decide(decision), /Acknowledge/);
    await assistant.decide({ ...decision, acknowledgeIncomplete: true });
  } finally { clearInterval(keepAlive); }
});

test('registry evidence cannot silently switch the discovered name, version or allowed host', async t => {
  const root = await fixture(t);
  for (const source of ['crates', 'nuget', 'rubygems'] as const) {
    const assistant = new ReuseAssistant(root, new Http(fakeFetch(url => {
      if (source === 'crates' && /scheduler\/1\.2\.3$/.test(url.pathname)) return json({ version: { crate: 'different', num: '9.0.0' } });
      if (source === 'nuget' && url.pathname.startsWith('/registration/')) return json({ items: [{ items: [{ catalogEntry: { id: 'different', version: '3.0.0' } }] }] });
      if (source === 'rubygems' && url.pathname.startsWith('/api/v2/')) return json({ name: 'different', version: '9.0.0' });
      return v2Response(url);
    }), '', ''));
    const report = await assistant.check({ task: 'Find scheduler', queries: ['scheduler'], sources: [source] });
    const inspected = await assistant.inspect(report.id, report.candidates.find(c => c.source !== 'local')!.id);
    assert.equal(inspected.status, 'partial');
    assert.equal(inspected.metadata.registry, undefined);
    assert.match(inspected.errors.join(' '), /disagrees/);
  }
  const assistant = new ReuseAssistant(root, new Http(fakeFetch(url => url.pathname === '/v3/index.json' ? json({ resources: [{ '@type': 'SearchQueryService', '@id': 'http://127.0.0.1/private' }] }) : v2Response(url)), '', ''));
  const report = await assistant.check({ task: 'Find scheduler', queries: ['scheduler'], sources: ['nuget'], useCache: false });
  assert.equal(report.sources.find(s => s.source === 'nuget')?.error?.code, 'invalid_url');
});

test('local discovery accepts unfamiliar language extensions while fingerprints cover additional root ecosystems', async t => {
  const root = await fixture(t);
  for (const name of ['job.zig', 'job.f90', 'job.hs', 'job.custom', 'Makefile']) await writeFile(path.join(root, name), 'schedulerImplementation');
  await writeFile(path.join(root, 'binary.custom'), Buffer.from([0, 1, 2]));
  await writeFile(path.join(root, '.env'), 'schedulerImplementation=secret');
  const assistant = new ReuseAssistant(root);
  const report = await assistant.check({ task: 'Find existing scheduler', queries: ['schedulerImplementation'], scope: 'local' });
  assert.equal(report.candidates.length, 5);
  const decision = { checkId: report.id, choice: 'build_new' as const, status: 'planned' as const, rationale: 'Existing files have no required public scheduling interface after inspection' };
  await assistant.decide(decision);
  await writeFile(path.join(root, 'app.csproj'), '<Project><ItemGroup /></Project>');
  await assert.rejects(assistant.decide(decision), /context changed/);
});

test('tokens stay on their own platform including dynamically discovered NuGet regions', async () => {
  const seen: { host: string; github: string | null; gitlab: string | null }[] = [];
  const http = new Http(fakeFetch((url, init) => { const h = new Headers(init?.headers); seen.push({ host: url.hostname, github: h.get('authorization'), gitlab: h.get('private-token') }); return json({}); }), 'gh-fixture', 'gl-fixture');
  for (const url of ['https://api.github.com/repos/example/repo', 'https://gitlab.com/api/v4/projects', 'https://crates.io/api/v1/crates', 'https://azuresearch-ea.nuget.org/query', 'https://repo.maven.apache.org/maven2/test.pom', 'https://rubygems.org/api/v1/search.json', 'https://packagist.org/search.json']) await http.json(url, AbortSignal.timeout(1000));
  assert.equal(seen[0]?.github, 'Bearer gh-fixture');
  assert.equal(seen[1]?.gitlab, 'gl-fixture');
  assert(seen.slice(2).every(s => !s.github && !s.gitlab));
  await assert.rejects(http.json('https://azuresearch-ea.nuget.org.attacker.test/query', AbortSignal.timeout(1000)), /supported public/);
});

test('NuGet regional redirects are bounded and cannot escape to arbitrary hosts or carry platform tokens', async () => {
  const seen: string[] = [];
  const http = new Http(fakeFetch((url, init) => {
    seen.push(url.hostname);
    assert.equal(new Headers(init?.headers).has('authorization'), false);
    assert.equal(new Headers(init?.headers).has('private-token'), false);
    if (url.hostname === 'api.nuget.org') return new Response('', { status: 302, headers: { location: 'https://nuget.azure.cn/v3/index.json' } });
    return json({ resources: [] });
  }), 'gh-secret', 'gl-secret');
  assert.deepEqual(await http.json('https://api.nuget.org/v3/index.json', AbortSignal.timeout(1000)), { resources: [] });
  assert.deepEqual(seen, ['api.nuget.org', 'nuget.azure.cn']);
  for (const location of ['https://evil.test/index.json', 'http://api.nuget.org/v3/index.json', 'https://api.nuget.org@evil.test/index.json', 'https://api.nuget.org/v3/index.json']) {
    let calls = 0;
    const blocked = new Http(fakeFetch(() => { calls++; return new Response('', { status: 302, headers: { location } }); }), '', '');
    await assert.rejects(blocked.json('https://api.nuget.org/v3/index.json', AbortSignal.timeout(1000)), (e: any) => e.code === 'redirect_blocked');
    assert(calls <= 4);
  }
});

test('NuGet version metadata follows discovered pages without needing an available catalog endpoint', async t => {
  const root = await fixture(t);
  const seen: string[] = [];
  const assistant = new ReuseAssistant(root, new Http(fakeFetch(url => {
    seen.push(url.pathname);
    if (url.pathname === '/registration/scheduler/index.json') return json({ items: [{ '@id': 'https://api.nuget.org/pages/latest.json' }] });
    if (url.pathname === '/pages/latest.json') return json({ items: [{ catalogEntry: { id: 'Scheduler', version: '3.0.0', licenseExpression: 'MIT' } }] });
    if (url.pathname.startsWith('/catalog/')) return json({}, 404);
    return v2Response(url);
  }), '', ''));
  const report = await assistant.check({ task: 'Find scheduler', queries: ['scheduler'], sources: ['nuget'] });
  const evidence = await assistant.inspect(report.id, 'nuget:Scheduler');
  assert.equal((evidence.metadata.registry as any).version, '3.0.0');
  assert(evidence.files.some(f => f.url.endsWith('/pages/latest.json') && f.ref === '3.0.0'));
  assert(!seen.some(p => p.startsWith('/catalog/')));
});

test('Packagist release source reference selects the commit instead of repository HEAD', async t => {
  const root = await fixture(t);
  const refs: string[] = [];
  const assistant = new ReuseAssistant(root, new Http(fakeFetch(url => {
    if (url.hostname === 'packagist.org' && url.pathname === '/packages/example/scheduler.json') return json({ package: { name: 'example/scheduler', versions: { '1.0.0': { name: 'example/scheduler', version: '1.0.0', source: { type: 'git', url: 'https://github.com/tiny/scheduler', reference: SHA }, license: ['MIT'] } } } });
    if (url.pathname.startsWith('/repos/tiny/scheduler/commits/')) refs.push(url.pathname.split('/').at(-1)!);
    return githubEvidence(url) ?? v2Response(url);
  }), '', ''));
  const report = await assistant.check({ task: 'Find scheduler', queries: ['scheduler'], sources: ['packagist'] });
  const evidence = await assistant.inspect(report.id, 'packagist:example/scheduler');
  assert.equal(evidence.metadata.codeVersionAssociation, 'Packagist source.reference');
  assert.deepEqual(refs, [SHA]);
  assert.equal(evidence.status, 'complete');
});

test('a full shortlist retains representatives of every returning platform and registry', async t => {
  const root = await fixture(t);
  for (let i = 0; i < 8; i++) await writeFile(path.join(root, `local-${i}.ts`), 'scheduler feature parser');
  const rows = Array.from({ length: 6 }, (_, i) => i);
  const assistant = new ReuseAssistant(root, new Http(fakeFetch(url => {
    if (url.hostname === 'api.github.com') return json({ items: rows.map(i => ({ full_name: `owner/scheduler-${i}`, description: 'scheduler feature parser' })) });
    if (url.hostname === 'gitlab.com') return json(rows.map(i => ({ path_with_namespace: `owner/project-${i}`, web_url: `https://gitlab.com/owner/project-${i}`, description: '' })));
    if (url.hostname === 'registry.npmjs.org') return json({ objects: rows.map(i => ({ package: { name: `scheduler-${i}`, version: '1.0.0', description: 'scheduler feature parser' } })) });
    if (url.hostname === 'crates.io') return json({ crates: rows.map(i => ({ name: `scheduler-${i}`, max_version: '1.0.0' })) });
    if (url.hostname === 'rubygems.org') return json(rows.map(i => ({ name: `gem-${i}`, version: '1.0.0' })));
    if (url.hostname === 'packagist.org') return json({ results: rows.map(i => ({ name: `vendor/package-${i}` })) });
    throw new Error('Unexpected endpoint');
  }), '', ''));
  const sources: RemoteSource[] = ['github', 'gitlab', 'npm', 'crates', 'rubygems', 'packagist'];
  const r = await assistant.check({ task: 'Find scheduler', queries: ['scheduler feature parser'], sources });
  assert.equal(r.candidates.length, 30);
  for (const source of sources) assert(r.candidates.some(c => c.sources?.includes(source)), `Missing ${source}`);
});

test('real MCP stdio exposes new sources and completes a GitLab package-alias decision lifecycle', { timeout: 20000 }, async t => {
  const root = await fixture(t);
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('./v2-mcp-server.js', import.meta.url)), root], stderr: 'pipe' });
  const client = new Client({ name: 'v2-acceptance', version: '0.2.0' });
  t.after(() => client.close());
  await client.connect(transport);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r: any = await client.callTool({ name, arguments: args });
    assert.notEqual(r.isError, true, r.content?.[0]?.text);
    return JSON.parse(r.content[0].text);
  };
  const r = await call('check_reuse', { task: 'Use Rust scheduler', queries: ['scheduler'], ecosystem: 'rust', sources: ['crates', 'gitlab'] });
  assert.deepEqual(r.input.sources, ['gitlab', 'crates']);
  const e = await call('inspect_candidate', { checkId: r.id, candidateId: 'crates:scheduler', paths: ['src/job.zig#L2-L3'] });
  assert.equal(e.metadata.ref, SHA);
  const args = { checkId: r.id, choice: 'adopt_dependency', rationale: 'Inspected fixed package metadata and repository code satisfy the required scheduler interface', candidateIds: [`gitlab:${GL}`], evidenceIds: [e.id] };
  const plan = await call('record_decision', { ...args, status: 'planned' });
  const applied = await call('record_decision', { ...args, status: 'applied', previousDecisionId: plan.id });
  const verified = await call('record_decision', { ...args, status: 'verified', previousDecisionId: applied.id, validation: 'Deterministic MCP acceptance fixture completed; host claim only, no upstream code executed' });
  assert.equal(verified.status, 'verified');
  const bad: any = await client.callTool({ name: 'check_reuse', arguments: { task: 'Invalid source', queries: ['scheduler'], sources: ['invented'] } });
  assert.equal(bad.isError, true);
});

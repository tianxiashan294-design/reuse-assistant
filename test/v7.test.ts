import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { ReuseAssistant } from '../src/core.js';
import { Http } from '../src/http.js';
import { cliPath } from '../src/install.js';
import { fixture, fakeFetch, json } from './support.js';
import { v7Response, v7Fetch } from './v7-support.js';
import type { AlignmentInput } from '../src/types.js';

const code = {
  'Worker.java': '// 中文😀\r\nimport java.util.List;\r\nimport static java.util.Collections.*;\r\nclass Worker {\r\n int state;\r\n String text = "class Fake {}";\r\n Worker() {}\r\n int run() { state++; if (state > 0) return work(); throw new RuntimeException(); }\r\n}\r\n',
  'Worker.cs': 'using System;\nusing Alias = Private.Store;\nnamespace Demo {\n class Worker {\n  string text = "class Fake {} 中文😀";\n  int state;\n  int Run() { state++; if (!Ready()) return Work(); throw new Exception(); }\n }\n}\n',
  'worker.c': '#include "private.h"\n// int fake() {} 中文😀\nstruct Worker { int state; };\nint run(int state) { state += 1; if (state) return work(); return 0; }\n',
  'worker.cpp': '#include <vector>\nnamespace Demo {\n// class Fake {} 中文😀\nclass Worker {\n int state;\n int run() { state++; if (state) return work(); throw Error(); }\n};\n}\n',
};

test('public core parses Java/C#/C/C++ boundaries, parents, Unicode facts and imports without linking targets', async t => {
  const root = await fixture(t);
  for (const [name, text] of Object.entries(code)) await writeFile(path.join(root, name), text);
  const core = new ReuseAssistant(root);
  const check = await core.check({ task: 'Inspect Worker', queries: ['Worker'], scope: 'local', alignment: { requirements: [], forbiddenImports: [{ from: 'Worker.java', to: 'java.util' }, { from: 'Worker.cs', to: 'Private.Store' }, { from: 'worker.c', to: 'private.h' }, { from: 'worker.cpp', to: 'vector' }] } });
  const e = await core.inspect(check.id, check.candidates[0]!.id, Object.keys(code));
  assert.equal(e.analysis!.coverage, 'complete', e.analysis!.gaps.join('\n'));
  assert.equal(e.analysis!.parsers!.length, 4);
  assert.equal(e.analysis!.linkage!.coverage, 'partial');
  assert(e.analysis!.linkage!.calls.every(c => c.status === 'unresolved'));
  for (const [file, symbol] of [['Worker.java', 'run'], ['Worker.cs', 'Run'], ['worker.c', 'run'], ['worker.cpp', 'run']]) {
    const s = e.analysis!.segments.find(s => s.path === file && s.symbol === symbol)!;
    assert(s, `${file} function symbol`);
    const text = code[file as keyof typeof code];
    assert.equal(s.sha256, createHash('sha256').update(text.slice(s.startOffset, s.endOffset)).digest('hex'));
    assert.equal(s.startLine, text.slice(0, s.startOffset).split('\n').length);
    assert.equal(s.endLine, text.slice(0, s.endOffset).split('\n').length);
    assert(s.writes.length > 0);
    assert(s.calls.some(c => /[Ww]ork/.test(c)));
    assert(s.controls.branches > 0);
    let current = s;
    while (current.parentId) {
      const parent = e.analysis!.segments.find(p => p.id === current.parentId)!;
      assert(parent.startOffset <= current.startOffset && parent.endOffset >= current.endOffset);
      current = parent;
    }
    assert.equal(current.kind, 'module');
  }
  assert(!e.analysis!.segments.some(s => /[Ff]ake/.test(s.symbol)));
  const cs = e.analysis!.segments.find(s => s.path === 'Worker.cs' && s.symbol === 'Run')!;
  assert(cs.calls.includes('Ready'));
  assert(!cs.writes.some(w => w.includes('Ready')));
  assert(e.analysis!.imports.some(i => i.specifier === 'java.util.Collections.*'));
  assert(e.analysis!.imports.every(i => i.resolution === 'unsupported' && !i.targetPath));
  const ids = e.analysis!.segments.map(s => s.id);
  const input: AlignmentInput = { checkId: check.id, choice: 'reuse_local', candidateIds: [e.candidateId], evidenceIds: [e.id], segmentIds: ids, claims: [{ requirementId: 'task', verdict: 'supported', rationale: 'Static inspected declarations with parent context', segmentIds: ids }], alternatives: [{ kind: 'keep_existing', summary: 'Keep text', tradeoffs: 'No boundaries' }, { kind: 'selected', summary: 'Use parsed declarations', tradeoffs: 'Unknown targets remain explicit' }], integration: { target: 'Shared inspection', compatibility: 'Syntax only', validationPlan: 'Public evidence and forbidden dependencies' } };
  const report = await core.assess(input);
  assert.equal(report.status, 'blocked');
  for (const file of Object.keys(code)) assert(report.blockers.some(b => b.includes(file)), file);
});

test('new grammars preserve parse failures, excerpts, header ambiguity, preprocessing and budgets', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'entry.ts'), 'export const reuseProbe = 1;');
  const core = new ReuseAssistant(root);
  const check = await core.check({ task: 'Inspect failure behavior', queries: ['reuseProbe'], scope: 'local' });
  const id = check.candidates[0]!.id;
  for (const file of Object.keys(code)) await writeFile(path.join(root, file), file.endsWith('.java') || file.endsWith('.cs') ? 'class Broken {' : 'int broken( {');
  const invalid = await core.inspect(check.id, id, Object.keys(code));
  assert.equal(invalid.analysis!.segments.filter(s => s.kind === 'text').length, 4);
  for (const [file, text] of Object.entries(code)) await writeFile(path.join(root, file), text);
  const clipped = await core.inspect(check.id, id, ['Worker.java#L4-L7', 'worker.cpp#L2-L6']);
  assert.equal(clipped.analysis!.segments.filter(s => s.kind === 'text').length, 2);
  await writeFile(path.join(root, 'ambiguous.h'), 'int run() { return 1; }\n');
  await writeFile(path.join(root, 'macros.cxx'), '#define ENABLED 1\n#if ENABLED\nint run() { return work(); }\n#endif\n');
  const special = await core.inspect(check.id, id, ['ambiguous.h', 'macros.cxx']);
  assert(special.analysis!.gaps.some(g => g.includes('ambiguous .h')));
  assert(special.analysis!.gaps.some(g => g.includes('preprocessing')));
  await writeFile(path.join(root, 'many.java'), 'class Many {' + Array.from({ length: 130 }, (_, i) => `int f${i}() { return ${i}; }`).join('\n') + '}');
  const many = await core.inspect(check.id, id, ['many.java', 'worker.c']);
  assert(many.analysis!.segments.length <= 100);
  assert(many.analysis!.gaps.some(g => g.includes('budget')));
});

test('pub official corpus pages and persistent eight-hour cache preserve limited coverage and fixed version metadata', async t => {
  const root = await fixture(t);
  let requests = 0;
  const http = new Http(fakeFetch((u, init) => { requests++; assert.equal((init!.headers as any).Authorization, undefined); assert.equal((init!.headers as any)['PRIVATE-TOKEN'], undefined); return v7Response(u); }), 'github-secret', 'gitlab-secret');
  const core = new ReuseAssistant(root, http);
  const input = { task: 'Find JSON', queries: ['json'], sources: ['pub'] as const, maxPages: 3, useCache: false };
  const r = await core.check({ ...input, sources: ['pub'] });
  const result = r.sources.find(s => s.source === 'pub')!;
  assert.equal(result.candidates.length, 13);
  assert.equal(result.pagination!.pagesFetched, 3);
  assert.equal(result.pagination!.totalAvailable, 13);
  assert.equal(result.pagination!.stopReason, 'exhausted');
  assert(result.notes.some(n => n.includes('not description/full-text')));
  assert.equal(r.sourcePlan!.find(p => p.source === 'pub')!.mode, 'name_search');
  assert.equal(requests, 1);
  const second = await new ReuseAssistant(root, http).check({ ...input, sources: ['pub'], queries: ['json_1'] });
  assert(second.sources.find(s => s.source === 'pub')!.notes.some(n => n.includes('corpus cache: true')));
  assert.equal(requests, 1);
  const e = await core.inspect(r.id, 'pub:json_0');
  assert.equal((e.metadata.registry as any).version, '1.2.3');
  assert(e.files.some(f => f.url.endsWith('/versions/1.2.3') && f.ref === '1.2.3' && f.content.includes('archive_sha256')));
  assert(e.notes.some(n => n.includes('unverified')));
  // Only corpus retrieval + latest locator + fixed version; archive URL never fetched.
  assert.equal(requests, 3);
  await core.store.write('cache', 'pub-names-v1', { createdAt: new Date(Date.now() - 9 * 3600000).toISOString(), names: ['old'] });
  await core.check({ ...input, sources: ['pub'] });
  assert.equal(requests, 4);
});

test('Hex pages retain discovered stable version and separate mutable package metadata from pinned release', async t => {
  const core = new ReuseAssistant(await fixture(t), new Http(v7Fetch(), '', ''));
  const r = await core.check({ task: 'Find JSON', queries: ['json'], sources: ['hex'], maxPages: 3 });
  const s = r.sources.find(s => s.source === 'hex')!;
  assert.equal(s.candidates.length, 13);
  assert.equal(s.pagination!.pagesFetched, 3);
  const e = await core.inspect(r.id, 'hex:json_0');
  assert.equal((e.metadata.registry as any).version, '1.2.3');
  assert.equal((e.metadata.registry as any).license, 'Apache-2.0');
  assert(e.files.some(f => f.path === 'HEX-PUBLISHED-METADATA.json' && f.ref === '1.2.3' && f.content.includes('checksum')));
  assert.equal(e.files.find(f => f.path === 'HEX-PACKAGE-METADATA.json')!.ref, undefined);
  assert(e.notes.some(n => n.includes('mutable')));
  assert.equal(e.status, 'partial'); // no associated code/license evidence
});

test('new registry malformed/rate-limited/identity failures remain public and do not follow untrusted URLs', async t => {
  for (const source of ['pub', 'hex'] as const) {
    const root = await fixture(t);
    const broken = new ReuseAssistant(root, new Http(fakeFetch(() => json(source === 'pub' ? { packages: ['../bad'] } : { bad: true })), '', ''));
    const bad = await broken.check({ task: 'Find JSON', queries: ['json'], sources: [source] });
    assert.equal(bad.sources.find(s => s.source === source)!.error!.code, 'invalid_response');
    const mismatch = new ReuseAssistant(root, new Http(fakeFetch(u => u.pathname.includes('/versions/') ? json({ version: '2.0.0', pubspec: { name: 'wrong', version: '2.0.0' } }) : u.pathname.includes('/releases/') ? json({ version: '1.2.3', url: 'https://hex.pm/api/packages/another/releases/1.2.3' }) : v7Response(u)), '', ''));
    const r = await mismatch.check({ task: 'Find JSON', queries: ['json'], sources: [source], useCache: false });
    const e = await mismatch.inspect(r.id, `${source}:json_0`);
    assert.equal(e.status, 'partial');
    assert(e.errors.some(s => /disagrees/.test(s)));
  }
  const core = new ReuseAssistant(await fixture(t), new Http(fakeFetch(u => u.hostname === 'hex.pm' && u.searchParams.get('page') === '2' ? json({}, 429, { 'retry-after': '60' }) : v7Response(u)), '', ''));
  const input = { task: 'Find JSON', queries: ['json'], sources: ['hex'] as ('hex')[] };
  const r = await core.check(input);
  const s = r.sources.find(s => s.source === 'hex')!;
  assert.equal(s.candidates.length, 6);
  assert.equal(s.status, 'partial');
  assert.equal(s.error!.code, 'rate_limited');
  assert.equal(s.pagination!.failedPage, 2);
  assert.equal((await core.check(input)).cached, false);
});

test('ecosystem routing, CLI schema and real MCP expose pub/Hex through the same core', { timeout: 20000 }, async t => {
  const root = await fixture(t);
  for (const [name, text] of Object.entries(code)) await writeFile(path.join(root, name), text);
  const client = new Client({ name: 'v7-acceptance', version: '1.0.0' });
  t.after(async () => { await client.close(); });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('./v7-mcp-server.js', import.meta.url)), root], stderr: 'pipe' }));
  const call = async (name: string, args: object) => { const r: any = await client.callTool({ name, arguments: { ...args } }); assert.notEqual(r.isError, true, r.content?.[0]?.text); return JSON.parse(r.content[0].text); };
  const local = await call('check_reuse', { task: 'Inspect Worker', queries: ['Worker'], scope: 'local' });
  const parsed = await call('inspect_candidate', { checkId: local.id, candidateId: local.candidates[0].id, paths: Object.keys(code) });
  assert.equal(parsed.analysis.parsers.length, 4);
  assert.equal(parsed.analysis.coverage, 'complete');
  const r = await call('check_reuse', { task: 'Find JSON', queries: ['json'], sources: ['pub', 'hex'], maxPages: 3 });
  assert.equal(r.sources.find((s: any) => s.source === 'pub').candidates.length, 13);
  assert.equal(r.sources.find((s: any) => s.source === 'hex').candidates.length, 13);
  for (const source of ['pub', 'hex']) {
    const e = await call('inspect_candidate', { checkId: r.id, candidateId: `${source}:json_0` });
    assert.equal(e.metadata.registry.version, '1.2.3');
    const d = await call('record_decision', { checkId: r.id, choice: 'adopt_dependency', candidateIds: [e.candidateId], evidenceIds: [e.id], status: 'planned', rationale: 'Fixture static metadata is retained with explicitly incomplete code coverage', acknowledgeIncomplete: true });
    assert.equal(d.status, 'planned');
  }
  const { checkSchema } = await import('../src/server.js');
  for (const [ecosystem, source] of [['dart', 'pub'], ['flutter', 'pub'], ['elixir', 'hex'], ['erlang', 'hex']] as const) {
    const core = new ReuseAssistant(root, new Http(fakeFetch(u => u.hostname === 'api.github.com' ? json({ items: [] }) : u.hostname === 'gitlab.com' ? json([]) : v7Response(u)), '', ''));
    const report = await core.check(checkSchema.parse({ task: 'Find JSON', queries: ['json'], ecosystem, maxPages: 1 }));
    assert.deepEqual(report.sources.slice(1).map(s => s.source), ['github', 'gitlab', source]);
  }
  const cli = await promisify(execFile)(process.execPath, [cliPath, 'check', '--project', root, '--task', 'Find Worker', '--query', 'Worker', '--ecosystem', 'dart', '--source', 'pub', '--source', 'hex', '--scope', 'local', '--json']);
  assert.equal(JSON.parse(cli.stdout).input.ecosystem, 'dart');
});

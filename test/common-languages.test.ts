import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { ReuseAssistant } from '../src/core.js';
import { Http } from '../src/http.js';
import { cliPath } from '../src/install.js';
import type { AlignmentInput, Inspection } from '../src/types.js';
import { fixture, fakeFetch, githubEvidence, json, repo } from './support.js';

const samples = {
  'worker.php': '<?php\r\n// 中文😀 function fake() {}\r\nuse PrivateStore\\Worker;\r\nrequire_once "./store.php";\r\nclass Worker {\r\n function run() {\r\n  $text = "function fake() {}";\r\n  $state = work();\r\n  if ($state) { return $state; }\r\n  return 0;\r\n }\r\n}\r\n',
  'worker.rb': '# 中文😀 def fake; end\nrequire_relative "./store"\nmodule Demo\n class Worker\n  def run\n   text = "def fake; end"\n   state = work()\n   if state\n    return state\n   end\n   return 0\n  end\n end\nend\n',
  'worker.kt': '// 中文😀 fun fake() {}\nimport privateStore.work\nclass Worker {\n fun run(): Int {\n  val text = "fun fake() {}"\n  var state = 0\n  state += work()\n  if (state > 0) { return state }\n  return 0\n }\n}\n',
  'worker.swift': '// 中文😀 func fake() {}\nimport PrivateStore\nclass Worker {\n func run() -> Int {\n  let text = "func fake() {}"\n  var state = 0\n  state += work()\n  if state > 0 { return state }\n  return 0\n }\n}\n',
  'worker.sh': '# 中文😀 fake() {}\nsource ./store.sh\nrun() {\n text="fake() {}"\n state=1\n if [ "$state" -gt 0 ]; then\n  work "$state"\n fi\n return 0\n}\n',
  'worker.lua': '-- 中文😀 function fake() end\nlocal store = require("private.store")\nlocal function run()\n local text = "function fake() end"\n local state = work()\n state = state + 1\n if state > 0 then return state end\n return 0\nend\n',
};
const imports = ['PrivateStore\\Worker', './store', 'privateStore.work', 'PrivateStore', './store.sh', 'private.store'];

function assessment(checkId: string, e: Inspection): AlignmentInput {
  const ids = e.analysis!.segments.map(s => s.id);
  return { checkId, choice: 'reuse_local', candidateIds: [e.candidateId], evidenceIds: [e.id], segmentIds: ids,
    claims: [{ requirementId: 'task', verdict: 'supported', rationale: 'Inspected static declarations and complete parent modules', segmentIds: ids }],
    alternatives: [{ kind: 'keep_existing', summary: 'Keep text evidence', tradeoffs: 'No declaration boundaries' }, { kind: 'selected', summary: 'Use inspected structure', tradeoffs: 'Foreign targets remain unresolved' }],
    integration: { target: 'Shared inspection core', compatibility: 'Syntax facts with explicit linkage gaps', validationPlan: 'Public inspection and alignment gates' } };
}

test('six common languages expose exact declarations, parent chains, imports and bounded facts through public core', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'entry.ts'), 'export const reuseProbe = 1;');
  const core = new ReuseAssistant(root);
  const check = await core.check({ task: 'Inspect common language structures', queries: ['reuseProbe'], scope: 'local', alignment: { requirements: [] } });
  for (const [index, [file, content]] of Object.entries(samples).entries()) {
    await writeFile(path.join(root, file), content);
    const e = await core.inspect(check.id, check.candidates[0]!.id, [file]);
    const a = e.analysis!;
    assert.equal(a.coverage, 'complete', `${file}: ${a.gaps.join('\n')}`);
    assert.equal(a.parsers!.length, 1, file);
    const s = a.segments.find(s => s.path === file && s.symbol === 'run')!;
    assert(s, `${file}: named function`);
    assert.equal(s.sha256, createHash('sha256').update(content.slice(s.startOffset, s.endOffset)).digest('hex'));
    assert.equal(s.startLine, content.slice(0, s.startOffset).split('\n').length);
    assert.equal(s.endLine, content.slice(0, s.endOffset).split('\n').length);
    assert(s.calls.includes('work'), `${file}: ${s.calls}`);
    assert(s.writes.length > 0, `${file}: writes`);
    assert(s.controls.branches > 0, `${file}: branches`);
    assert(s.controls.returns > 0, `${file}: returns`);
    let current = s;
    while (current.parentId) {
      const parent = a.segments.find(p => p.id === current.parentId)!;
      assert(parent.startOffset <= current.startOffset && parent.endOffset >= current.endOffset);
      current = parent;
    }
    assert.equal(current.kind, 'module');
    assert(!a.segments.some(s => s.symbol === 'fake'));
    assert(a.imports.some(i => i.specifier === imports[index]), `${file}: ${JSON.stringify(a.imports)}`);
    assert(a.imports.filter(i => i.from === file).every(i => i.resolution === 'unsupported' && !i.targetPath));
    assert.equal(a.linkage!.coverage, 'partial');
    assert(a.linkage!.calls.filter(c => c.from === file).every(c => c.status === 'unresolved'));
    const input = assessment(check.id, e);
    const report = await core.assess(input);
    assert.equal(report.status, 'ready', report.blockers.join('\n'));
    const decision = { checkId: check.id, choice: 'reuse_local' as const, status: 'planned' as const, candidateIds: [e.candidateId], evidenceIds: [e.id], alignmentId: report.id, rationale: 'Use structures with explicit foreign-target gaps' };
    await assert.rejects(core.decide(decision), /incomplete alignment/);
    await core.decide({ ...decision, acknowledgeIncomplete: true });
    assert.equal((await core.assess({ ...input, claims: input.claims.map(c => ({ ...c, verdict: 'unknown' as const })) })).status, 'blocked');
    assert.equal((await core.assess({ ...input, segmentIds: [s.id], claims: input.claims.map(c => ({ ...c, segmentIds: [s.id] })) })).status, 'blocked');
  }
});

test('common language invalid syntax, excerpts, dynamic loads and shared limits remain public', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'entry.ts'), 'export const reuseProbe = 1;');
  const core = new ReuseAssistant(root);
  const check = await core.check({ task: 'Inspect failures and limits', queries: ['reuseProbe'], scope: 'local' });
  const id = check.candidates[0]!.id;
  const bad = ['<?php function run( {', 'def run(\n', 'fun run( {', 'func run( {', 'run() { if', 'function run( end'];
  for (const [index, [file, content]] of Object.entries(samples).entries()) {
    await writeFile(path.join(root, file), bad[index]!);
    const e = await core.inspect(check.id, id, [file]);
    assert.equal(e.analysis!.segments.find(s => s.path === file)!.kind, 'text', file);
    assert(e.analysis!.gaps.some(g => g.includes('parse failed')), file);
    assert(!e.analysis!.imports.some(i => i.from === file));
    assert(!e.analysis!.linkage!.calls.some(c => c.from === file));
    await writeFile(path.join(root, file), content);
    const excerpt = await core.inspect(check.id, id, [`${file}#L3-L4`]);
    assert.equal(excerpt.analysis!.segments.find(s => s.path === file)!.kind, 'text');
    assert(excerpt.analysis!.gaps.some(g => g.includes('excerpted')));
  }
  const dynamic = { 'dynamic.php': '<?php require $path;', 'dynamic.rb': 'require "./#{name}"', 'dynamic.sh': 'source "$path"\neval "$cmd"', 'dynamic.lua': 'local m = require(name)' };
  for (const [file, content] of Object.entries(dynamic)) {
    await writeFile(path.join(root, file), content);
    const e = await core.inspect(check.id, id, [file]);
    assert(e.analysis!.gaps.some(g => g.includes('dynamic/escaped')), file);
    assert(e.analysis!.imports.some(i => i.from === file && i.resolution === 'unsupported'));
  }
  await writeFile(path.join(root, 'many.lua'), Array.from({ length: 130 }, (_, i) => `local function f${i}() return ${i} end`).join('\n'));
  const budget = await core.inspect(check.id, id, ['many.lua', 'worker.swift']);
  assert(budget.analysis!.segments.length <= 100);
  assert(budget.analysis!.gaps.some(g => g.includes('budget')));
  assert(!budget.analysis!.segments.some(s => s.path === 'worker.swift'));
  await writeFile(path.join(root, 'calls.sh'), Array.from({ length: 320 }, (_, i) => `work ${i}`).join('\n'));
  const calls = await core.inspect(check.id, id, ['calls.sh']);
  assert.equal(calls.analysis!.linkage!.calls.length, 300);
  assert(calls.analysis!.gaps.some(g => g.includes('Call-link budget')));
});

test('actual MCP and CLI expose every common language and forbid recorded imports', { timeout: 30000 }, async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'entry.ts'), 'export const reuseProbe = 1;');
  for (const [file, content] of Object.entries(samples)) await writeFile(path.join(root, file), content);
  const client = new Client({ name: 'common-language-acceptance', version: '1.0.0' });
  t.after(async () => { await client.close(); });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [cliPath, 'mcp', '--project', root], stderr: 'pipe' }));
  const call = async (name: string, args: object) => {
    const r: any = await client.callTool({ name, arguments: { ...args } });
    assert.notEqual(r.isError, true, r.content?.[0]?.text);
    return JSON.parse(r.content[0].text);
  };
  const check = await call('check_reuse', { task: 'Inspect common languages', queries: ['reuseProbe'], scope: 'local', alignment: { requirements: [], forbiddenImports: Object.keys(samples).map((file, i) => ({ from: file, to: imports[i] })) } });
  for (const file of Object.keys(samples)) {
    const e = await call('inspect_candidate', { checkId: check.id, candidateId: check.candidates[0].id, paths: [file] });
    assert.equal(e.analysis.parsers.length, 1, file);
    assert(e.analysis.segments.some((s: any) => s.path === file && s.symbol === 'run'), file);
    const report = await call('assess_alignment', assessment(check.id, e));
    assert.equal(report.status, 'blocked');
    assert(report.blockers.some((b: string) => b.includes(file)), file);
    const rejected: any = await client.callTool({ name: 'record_decision', arguments: { checkId: check.id, choice: 'reuse_local', candidateIds: [e.candidateId], evidenceIds: [e.id], alignmentId: report.id, rationale: 'Acknowledgment cannot override a forbidden dependency', acknowledgeIncomplete: true } });
    assert.equal(rejected.isError, true);
    const cli = await promisify(execFile)(process.execPath, [cliPath, 'inspect', '--project', root, '--check', check.id, '--candidate', e.candidateId, '--path', file, '--json']);
    assert.equal(JSON.parse(cli.stdout).analysis.parsers.length, 1, file);
  }
});

test('language variants retain nested declarations, real call syntax and grouped import context', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'entry.ts'), 'export const reuseProbe = 1;');
  const core = new ReuseAssistant(root);
  const check = await core.check({ task: 'Inspect nested syntax', queries: ['reuseProbe'], scope: 'local' });
  const variants = [
    { file: 'nested.phtml', text: '<?php use Vendor\\Store\\{Reader as R, Writer}; trait Work { function outer() { $f = fn($x) => $x; function inner() { return work(); } return $this->work(); } }', kinds: ['trait_declaration', 'arrow_function'], calls: ['$this->work'], deps: ['Vendor\\Store\\Reader', 'Vendor\\Store\\Writer'] },
    { file: 'nested.rake', text: 'class Worker\n def self.outer\n  f = ->(x) { work(x) }\n  store.work()\n end\nend\n', kinds: ['singleton_method', 'lambda'], calls: ['store.work'], deps: [] },
    { file: 'nested.kts', text: 'import privateStore.*\ntypealias Value = Int\nobject Worker {\n fun outer() {\n  fun inner() { store.work() }\n  val f = { work() }\n  inner()\n }\n}\n', kinds: ['type_alias', 'object_declaration', 'lambda_literal'], calls: ['store.work'], deps: ['privateStore.*'] },
    { file: 'nested.swift', text: 'import struct Foundation.Date\nprotocol Work { func run() }\nstruct Worker { func outer() { func inner() { store.work() }; let f = { work() }; inner() } }\n', kinds: ['protocol_declaration', 'protocol_function_declaration', 'class_declaration', 'lambda_literal'], calls: ['store.work'], deps: ['Foundation.Date'] },
    { file: 'nested.bash', text: '. "./store.sh"\nouter() {\n inner() { work; }\n cat <<\'EOF\'\nfake() { work; }\nEOF\n inner\n}\n', kinds: ['function_definition'], calls: ['work'], deps: ['./store.sh'] },
    { file: 'nested.lua', text: 'local m = require "private.store"\nlocal function outer()\n local function inner() return store:work() end\n local f = function(x) return work(x) end\n return inner()\nend\n', kinds: ['function_definition', 'function_declaration'], calls: ['store:work'], deps: ['private.store'] },
  ];
  for (const v of variants) {
    await writeFile(path.join(root, v.file), v.text);
    const e = await core.inspect(check.id, check.candidates[0]!.id, [v.file]);
    const a = e.analysis!;
    assert.equal(a.coverage, 'complete', `${v.file}: ${a.gaps}`);
    for (const kind of v.kinds) assert(a.segments.some(s => s.path === v.file && s.kind === kind), `${v.file}: ${kind}`);
    for (const call of v.calls) assert(a.segments.some(s => s.calls.includes(call)), `${v.file}: ${call}`);
    for (const dep of v.deps) assert(a.imports.some(i => i.specifier === dep), `${v.file}: ${dep}; ${JSON.stringify(a.imports)}`);
    assert(!a.segments.some(s => s.symbol === 'fake'));
    const inner = a.segments.find(s => s.symbol === 'inner');
    if (inner) assert.equal(a.segments.find(s => s.id === inner.parentId)!.symbol, 'outer');
    if (v.file.endsWith('.kts')) assert(a.segments.some(s => s.symbol === 'Value'));
  }
});

test('public adaptation decisions accept newly recognized code extensions with fixed licensed source evidence', async t => {
  const root = await fixture(t);
  const http = new Http(fakeFetch(url => {
    if (url.pathname === '/search/repositories') return json({ total_count: 1, items: [repo] });
    const file = url.pathname.split('/').at(-1)!;
    if (url.pathname.startsWith('/repos/tiny/scheduler/contents/') && file in samples) return json({ type: 'file', path: file, encoding: 'base64', content: Buffer.from(samples[file as keyof typeof samples]).toString('base64') });
    const response = githubEvidence(url);
    if (response) return response;
    throw new Error(`Unexpected fixture URL: ${url.href}`);
  }), '', '');
  const core = new ReuseAssistant(root, http);
  const check = await core.check({ task: 'Adapt inspected common-language code', queries: ['scheduler'], sources: ['github'], maxPages: 1, alignment: { requirements: [] } });
  for (const file of ['worker.swift', 'worker.sh', 'worker.lua']) {
    const e = await core.inspect(check.id, 'github:tiny/scheduler', [file]);
    assert(e.metadata.license);
    assert(e.files.some(f => f.path === file && /^[a-f0-9]{40}$/.test(f.ref!)));
    const report = await core.assess({ ...assessment(check.id, e), choice: 'adapt_code' });
    assert.equal(report.status, 'ready', report.blockers.join('\n'));
    await core.decide({ checkId: check.id, choice: 'adapt_code', status: 'planned', candidateIds: [e.candidateId], evidenceIds: [e.id], alignmentId: report.id, acknowledgeIncomplete: true, rationale: 'Adapt fixed licensed code with explicit foreign-target and fixture source coverage limits' });
  }
});

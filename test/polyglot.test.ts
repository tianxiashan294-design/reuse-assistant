import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { ReuseAssistant } from '../src/core.js';
import type { AlignmentInput, CheckReport, Inspection } from '../src/types.js';
import { cliPath } from '../src/install.js';
import { fixture } from './support.js';

const samples: Record<string, string> = {
  'worker.py': '# 中文😀\r\nfrom .store import save\r\nimport os.path as fs, sys\r\ntext = "def fake(): pass"\r\n@decorate\r\nclass Worker:\r\n    async def run(self):\r\n        self.state = await save("中文😀")\r\n        if self.state:\r\n            return self.state\r\n        try:\r\n            raise RuntimeError()\r\n        except Exception:\r\n            return None\r\n',
  'worker.go': 'package worker\nimport ("fmt"; db "example.org/store")\n// func fake() {}\nvar text = "func fake() {} 中文😀"\ntype Worker struct { state int }\nfunc (w *Worker) Run() int {\n w.state += 1\n if w.state > 0 { fmt.Println(text) }\n return w.state\n}\n',
  'worker.rs': 'use crate::store::{save, State};\n// fn fake() {}\nconst TEXT: &str = "fn fake() {} 中文😀";\nstruct Worker { state: i32 }\nimpl Worker {\n async fn run(&mut self) -> i32 {\n  self.state = save().await;\n  if self.state > 0 { return self.state; }\n  0\n }\n}\n',
};

function assessment(check: CheckReport, evidence: Inspection): AlignmentInput {
  const ids = evidence.analysis!.segments.filter(s => s.kind !== 'text').map(s => s.id);
  return { checkId: check.id, choice: 'reuse_local', candidateIds: [evidence.candidateId], evidenceIds: [evidence.id], segmentIds: ids,
    claims: [{ requirementId: 'task', verdict: 'supported', rationale: 'Inspected language declarations and their parent modules meet the static evidence requirement.', segmentIds: ids }],
    alternatives: [{ kind: 'keep_existing', summary: 'Keep text evidence', tradeoffs: 'No structural boundaries' }, { kind: 'selected', summary: 'Use inspected declarations', tradeoffs: 'Retain unresolved dependencies for host review' }],
    integration: { target: 'Shared evidence core', compatibility: 'Static facts only, without source execution', validationPlan: 'Public inspection, alignment and decision gates' } };
}

test('public core inspects Python/Go/Rust structure, exact Unicode ranges, facts and conservative linkage', async t => {
  const root = await fixture(t);
  for (const [name, content] of Object.entries(samples)) await writeFile(path.join(root, name), content);
  const assistant = new ReuseAssistant(root);
  const check = await assistant.check({ task: 'Inspect Worker declarations', queries: ['Worker'], scope: 'local', alignment: { requirements: [] } });
  const candidate = check.candidates.find(c => c.localPath === 'worker.py')!;
  assert(candidate);
  const evidence = await assistant.inspect(check.id, candidate.id, Object.keys(samples));
  const analysis = evidence.analysis!;
  assert.equal(analysis.coverage, 'complete', analysis.gaps.join('\n'));
  assert.equal(analysis.parsers!.length, 3);
  assert.equal(analysis.linkage!.coverage, 'partial');
  assert(analysis.linkage!.calls.length > 3);
  assert(analysis.linkage!.calls.every(c => c.status === 'unresolved' && c.reason?.includes('not implemented')));
  for (const [file, name, kind] of [['worker.py', 'run', 'function_definition'], ['worker.go', 'Run', 'method_declaration'], ['worker.rs', 'run', 'function_item']]) {
    const s = analysis.segments.find(s => s.path === file && s.symbol === name)!;
    assert.equal(s.kind, kind);
    const content = samples[file!]!.slice(s.startOffset, s.endOffset);
    assert.equal(s.sha256, createHash('sha256').update(content).digest('hex'));
    assert.equal(s.startLine, samples[file!]!.slice(0, s.startOffset).split('\n').length);
    assert.equal(s.endLine, samples[file!]!.slice(0, s.endOffset).split('\n').length);
    assert(content.includes(name!));
    assert(s.calls.length > 0);
    assert(s.controls.branches > 0);
    assert(s.writes.length > 0);
    assert(s.parentId);
    const parent = analysis.segments.find(p => p.id === s.parentId)!;
    assert(parent.startOffset <= s.startOffset && parent.endOffset >= s.endOffset);
  }
  const py = analysis.segments.find(s => s.path === 'worker.py' && s.symbol === 'run')!;
  assert.equal(py.controls.awaits, 1);
  assert.equal(py.controls.throws, 1);
  assert.equal(py.controls.catches, 1);
  assert.equal(py.controls.returns, 2);
  assert(analysis.segments.find(s => s.path === 'worker.py' && s.symbol === 'Worker')!.preview.startsWith('@decorate'));
  assert(!analysis.segments.some(s => s.symbol === 'fake'));
  assert.deepEqual(analysis.imports.filter(e => e.from === 'worker.py').map(e => e.specifier), ['.store', 'os.path', 'sys']);
  assert(analysis.imports.some(e => e.specifier === 'example.org/store'));
  assert(analysis.imports.some(e => e.specifier.startsWith('crate::store')));
  assert(analysis.imports.every(e => e.resolution === 'unsupported' && !e.targetPath && !e.resolvedPath));
  const repeated = await assistant.inspect(check.id, candidate.id, Object.keys(samples));
  assert.deepEqual(repeated.analysis!.segments, analysis.segments);
  const input = assessment(check, evidence);
  const ready = await assistant.assess(input);
  assert.equal(ready.status, 'ready');
  assert.equal(ready.coverage, 'partial');
  assert(ready.callContext!.some(c => c.edge.from === 'worker.py'));
  const decision = { checkId: check.id, choice: 'reuse_local' as const, candidateIds: [candidate.id], evidenceIds: [evidence.id], alignmentId: ready.id, status: 'planned' as const, rationale: 'Reuse inspected structures with explicitly unresolved foreign module behavior' };
  await assert.rejects(assistant.decide(decision), /incomplete alignment/);
  await assistant.decide({ ...decision, acknowledgeIncomplete: true });
  const missingParent = await assistant.assess({ ...input, segmentIds: [py.id], claims: input.claims.map(c => ({ ...c, segmentIds: [py.id] })) });
  assert.equal(missingParent.status, 'blocked');
  const unknown = await assistant.assess({ ...input, claims: input.claims.map(c => ({ ...c, verdict: 'unknown' as const })) });
  assert.equal(unknown.status, 'blocked');
});

test('new language errors, excerpts, unsupported syntax and shared budgets remain explicit', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'entry.ts'), 'export const reuseProbe = () => 1;');
  const assistant = new ReuseAssistant(root);
  const check = await assistant.check({ task: 'Inspect parser failures', queries: ['reuseProbe'], scope: 'local' });
  const candidate = check.candidates[0]!;
  for (const [name, text] of [['bad.py', 'def broken(:\n'], ['bad.go', 'package x\nfunc broken( {'], ['bad.rs', 'fn broken( {'], ['other.dart', 'class Other {}']]) await writeFile(path.join(root, name!), text!);
  const failed = await assistant.inspect(check.id, candidate.id, ['bad.py', 'bad.go', 'bad.rs', 'other.dart']);
  assert.equal(failed.analysis!.coverage, 'partial');
  assert.equal(failed.analysis!.segments.filter(s => s.kind === 'text').length, 4);
  assert.equal(failed.analysis!.gaps.filter(g => g.includes('parse failed')).length, 3);
  await writeFile(path.join(root, 'worker.py'), samples['worker.py']!);
  const excerpt = await assistant.inspect(check.id, candidate.id, ['worker.py#L7-L10']);
  assert.equal(excerpt.analysis!.segments.find(s => s.path === 'worker.py')!.kind, 'text');
  assert(excerpt.analysis!.gaps.some(g => g.includes('excerpted')));
  await writeFile(path.join(root, 'many.py'), Array.from({ length: 120 }, (_, i) => `def f${i}():\n    return ${i}`).join('\n'));
  const budget = await assistant.inspect(check.id, candidate.id, ['many.py', 'worker.py']);
  assert(budget.analysis!.segments.length <= 100);
  assert(budget.analysis!.gaps.some(g => g.includes('budget')));
  assert(!budget.analysis!.segments.some(s => s.path === 'worker.py'));
  // JS and foreign call edges share the original 300-call output cap.
  await writeFile(path.join(root, 'calls.py'), Array.from({ length: 320 }, (_, i) => `work(${i})`).join('\n'));
  const calls = await assistant.inspect(check.id, candidate.id, ['calls.py']);
  assert.equal(calls.analysis!.linkage!.calls.length, 300);
  assert(calls.analysis!.gaps.some(g => g.includes('Call-link budget')) || calls.analysis!.linkage!.gaps.some(g => g.includes('Call-link budget')));
});

test('real MCP and CLI return foreign structures and enforce forbidden imports through shared core', { timeout: 20000 }, async t => {
  const root = await fixture(t);
  for (const [name, text] of Object.entries(samples)) await writeFile(path.join(root, name), text);
  const client = new Client({ name: 'polyglot-acceptance', version: '1.0.0' });
  t.after(async () => { await client.close(); });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [cliPath, 'mcp', '--project', root], stderr: 'pipe' }));
  const call = async (name: string, args: object) => {
    const r: any = await client.callTool({ name, arguments: { ...args } });
    assert.notEqual(r.isError, true, r.content?.[0]?.text);
    return JSON.parse(r.content[0].text);
  };
  const check = await call('check_reuse', { task: 'Inspect Worker', queries: ['Worker'], scope: 'local', alignment: { requirements: [], forbiddenImports: [{ from: 'worker.py', to: '.store' }, { from: 'worker.go', to: 'example.org/store' }, { from: 'worker.rs', to: 'crate::store' }] } });
  const id = check.candidates[0].id;
  const e = await call('inspect_candidate', { checkId: check.id, candidateId: id, paths: Object.keys(samples) });
  assert.equal(e.analysis.parsers.length, 3);
  const report = await call('assess_alignment', assessment(check, e));
  assert.equal(report.status, 'blocked');
  for (const file of Object.keys(samples)) assert(report.blockers.some((b: string) => b.includes(file)));
  const rejected: any = await client.callTool({ name: 'record_decision', arguments: { checkId: check.id, choice: 'reuse_local', candidateIds: [id], evidenceIds: [e.id], alignmentId: report.id, status: 'planned', rationale: 'Acknowledgment cannot bypass forbidden dependencies', acknowledgeIncomplete: true } });
  assert.equal(rejected.isError, true);
  const cli = await promisify(execFile)(process.execPath, [cliPath, 'inspect', '--project', root, '--check', check.id, '--candidate', id, '--path', 'worker.py', '--path', 'worker.go', '--path', 'worker.rs', '--json']);
  assert.equal(JSON.parse(cli.stdout).analysis.parsers.length, 3);
});

test('all parsers consume one inspection byte/node budget', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'entry.ts'), 'export const reuseProbe = () => 1;');
  const assistant = new ReuseAssistant(root);
  const check = await assistant.check({ task: 'Inspect shared budgets', queries: ['reuseProbe'], scope: 'local' });
  const candidate = check.candidates[0]!;
  const files = Array.from({ length: 5 }, (_, i) => `data${i}.py`);
  for (const name of files) await writeFile(path.join(root, name), '# ' + '😀'.repeat(10000) + '\ndef run():\n    pass\n');
  const bytes = await assistant.inspect(check.id, candidate.id, files);
  assert(bytes.analysis!.gaps.some(g => g.includes('180 KB')));
  assert(!bytes.analysis!.segments.some(s => s.path === 'data4.py'));
  for (const name of files) await writeFile(path.join(root, name), 'values = [' + Array.from({ length: 6500 }, () => '0').join(',') + ']\n');
  const nodes = await assistant.inspect(check.id, candidate.id, files);
  assert(nodes.analysis!.gaps.some(g => g.includes('AST node/segment budget')));
  assert(nodes.analysis!.segments.length < 100);
});

test('nested declarations, anonymous functions, Rust macro limits and dynamic imports retain context', async t => {
  const root = await fixture(t);
  const files = {
    'nested.py': '# def fakeComment(): pass\ntext = """def fakeText(): pass"""\ndef outer():\n    def inner():\n        return __import__("x")\n    return lambda x: inner()\n',
    'nested.go': 'package nested\nimport `example.org/raw`\ntype Alias = int\nfunc outer() { f := func() { work() }; f() }\n',
    'nested.rs': 'mod child;\ntrait Worker { fn run(&self); }\nunion Value { i: i32, f: f32 }\nfn outer() { let f = || work(); f(); println!("fn fake() {}"); }\n',
  };
  for (const [name, content] of Object.entries(files)) await writeFile(path.join(root, name), content);
  const assistant = new ReuseAssistant(root);
  const check = await assistant.check({ task: 'Inspect nested declarations', queries: ['outer'], scope: 'local' });
  const e = await assistant.inspect(check.id, check.candidates[0]!.id, Object.keys(files));
  assert.equal(e.analysis!.coverage, 'partial');
  assert(!e.analysis!.gaps.some(g => g.includes('parse failed')));
  const inner = e.analysis!.segments.find(s => s.symbol === 'inner')!;
  assert.equal(e.analysis!.segments.find(s => s.id === inner.parentId)!.symbol, 'outer');
  for (const kind of ['lambda', 'func_literal', 'type_alias', 'trait_item', 'union_item', 'closure_expression']) assert(e.analysis!.segments.some(s => s.kind === kind), kind);
  assert(!e.analysis!.segments.some(s => s.symbol.startsWith('fake')));
  assert(e.analysis!.imports.some(i => i.specifier === 'example.org/raw'));
  assert(e.analysis!.gaps.some(g => g.includes('macro/attribute')));
  assert(e.analysis!.gaps.some(g => g.includes('out-of-line')));
  assert(e.analysis!.gaps.some(g => g.includes('dynamic Python')));
});

test('shipped grammar files match pinned provenance and notices', async () => {
  const base = new URL('../../assets/grammars/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
  assert.deepEqual(manifest.map((e: any) => e.language), ['python', 'go', 'rust', 'java', 'c_sharp', 'c', 'cpp', 'php', 'ruby', 'kotlin', 'swift', 'bash', 'lua']);
  for (const entry of manifest) {
    const bytes = await readFile(new URL(`tree-sitter-${entry.language}.wasm`, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    if (entry.publishedDigest) assert.equal(entry.publishedDigest, `sha256:${entry.sha256}`);
    assert.match(entry.revision, /^[a-f0-9]{40}$/);
    assert.match(await readFile(new URL(entry.license, base), 'utf8'), /Copyright.*\n[\s\S]*Permission is hereby granted/);
  }
});

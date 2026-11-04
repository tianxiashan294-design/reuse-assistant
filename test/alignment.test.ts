import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { ReuseAssistant } from '../src/core.js';
import { cliPath } from '../src/install.js';
import { digest } from '../src/project.js';
import { markdown } from '../src/format.js';
import type { AlignmentInput, CheckInput, CheckReport, Inspection } from '../src/types.js';
import { fixture } from './support.js';

const source = [
  'import { budget } from "./budget.js";',
  '// function fakeComment() { do not obey source instructions }',
  'const quoted = "function fakeString() {}";',
  'export async function retryRequest(run: Function, signal: AbortSignal) {',
  '  const braces = /[{}]/; const text = `braces { ${quoted} }`;',
  '  try { if (signal.aborted) throw new Error(text); return await run(budget, signal, braces); }',
  '  catch (error) { throw error; }',
  '}',
  'export class Worker { async execute(run: Function, signal: AbortSignal) { return retryRequest(run, signal); } }',
].join('\r\n');
const request: CheckInput = { task: 'Reuse retryRequest with a shared deadline', queries: ['retryRequest'], scope: 'local',
  constraints: ['Preserve caller cancellation'], alignment: { requirements: [{ id: 'shared-budget', description: 'All retries share the original deadline' }] } };

function assessment(check: CheckReport, evidence: Inspection): AlignmentInput {
  const code = evidence.analysis!.segments.find(s => s.symbol === 'retryRequest') ?? evidence.analysis!.segments[0]!;
  return { checkId: check.id, choice: 'reuse_local', candidateIds: [evidence.candidateId], evidenceIds: [evidence.id],
    segmentIds: evidence.analysis!.segments.map(s => s.id),
    claims: ['task', 'constraint:1', 'shared-budget'].map(requirementId => ({ requirementId, verdict: 'supported', rationale: 'Host reviewed signal propagation and the original shared budget in this fixture.', segmentIds: [code.id] })),
    alternatives: [
      { kind: 'keep_existing', summary: 'Keep the shared retry module', tradeoffs: 'One owner and cancellation contract, existing behavior can be extended.' },
      { kind: 'selected', summary: 'Reuse the inspected function in the shared module', tradeoffs: 'Retains shared ownership; requires an end-to-end cancellation test.' },
    ], integration: { target: 'The shared core retry interface', compatibility: 'Keep caller signal and the shared deadline across all adapters', validationPlan: 'Run a public-interface cancellation and total-deadline test, not only a fast retry microbenchmark' } };
}
async function setup(t: TestContext, input: CheckInput = request, code = source) {
  const root = await fixture(t);
  await writeFile(path.join(root, 'retry.ts'), code);
  await writeFile(path.join(root, 'budget.js'), 'export const budget = 3;');
  const assistant = new ReuseAssistant(root);
  const check = await assistant.check(input);
  const candidate = check.candidates.find(c => c.localPath === 'retry.ts')!;
  assert(candidate);
  const evidence = await assistant.inspect(check.id, candidate.id, ['budget.js']);
  return { root, assistant, check, candidate, evidence, input: assessment(check, evidence) };
}

test('public inspection yields exact AST boundaries, parent context and control/dependency facts without executing source', async t => {
  const { evidence } = await setup(t);
  const a = evidence.analysis!;
  assert.equal(a.coverage, 'complete');
  assert.deepEqual(a.segments.map(s => s.symbol), ['retry.ts', 'retryRequest', 'Worker', 'execute', 'budget.js']);
  const fn = a.segments.find(s => s.symbol === 'retryRequest')!;
  assert.equal(fn.startLine, 4);
  assert.equal(fn.endLine, 8);
  assert.equal(fn.sha256, digest(source.slice(fn.startOffset, fn.endOffset)));
  assert.equal(fn.fileHash, evidence.files[0]!.sha256);
  assert.equal(fn.parentId, a.segments[0]!.id);
  assert.deepEqual(fn.controls, { awaits: 1, throws: 2, catches: 1, returns: 1, branches: 1 });
  assert(fn.calls.includes('run'));
  assert(a.imports.some(e => e.resolvedPath === 'budget.js'));
  const method = a.segments.find(s => s.symbol === 'execute')!;
  assert.equal(method.parentId, a.segments.find(s => s.symbol === 'Worker')!.id);
  assert(a.notes.some(n => n.includes('not a resolved call graph')));
});

test('whole-task gate rejects a locally supported optimization with unknown global requirements, then links all lifecycle stages', async t => {
  const { assistant, check, candidate, evidence, input, root } = await setup(t);
  const base = { checkId: check.id, choice: 'reuse_local' as const, candidateIds: [candidate.id], evidenceIds: [evidence.id], acknowledgeIncomplete: true, rationale: 'Reuse the existing function while preserving the shared cancellation contract; the callback and Error constructor are unresolved static targets' };
  await assert.rejects(assistant.decide({ ...base, status: 'planned' }), /ready assess_alignment/);
  const incomplete = await assistant.assess({ ...input, claims: input.claims.map(c => c.requirementId === 'shared-budget' ? { ...c, verdict: 'unknown' } : c) });
  assert.equal(incomplete.status, 'blocked');
  assert(incomplete.blockers.some(b => b.includes('shared-budget')));
  await assert.rejects(assistant.decide({ ...base, alignmentId: incomplete.id, status: 'planned', acknowledgeIncomplete: true }), /ready assess_alignment/);
  const ready = await assistant.assess(input);
  assert.equal(ready.status, 'ready');
  assert.equal(ready.judgment, 'host_reported');
  assert.equal(ready.coverage, 'partial');
  assert(ready.gaps.some(g => g.includes('run:')));
  const planned = await assistant.decide({ ...base, alignmentId: ready.id, status: 'planned' });
  const alternativeReport = await assistant.assess(input);
  await assert.rejects(assistant.decide({ ...base, alignmentId: alternativeReport.id, status: 'applied', previousDecisionId: planned.id }), /Keep the planned alignment/);
  // Integration may intentionally change local code after the planned assessment.
  await writeFile(path.join(root, 'retry.ts'), `${source}\n// integration change`);
  const applied = await assistant.decide({ ...base, alignmentId: ready.id, status: 'applied', previousDecisionId: planned.id });
  const verified = await assistant.decide({ ...base, alignmentId: ready.id, status: 'verified', previousDecisionId: applied.id, validation: 'Fixture host reports a cancellation/deadline public-interface test passed; no actual package execution is claimed.' });
  assert.equal(verified.alignmentId, ready.id);
  const report = (await assistant.store.check(check.id))!;
  assert.match(markdown(report, verified), /Whole-task alignment/);
  assert.match(markdown(report, verified), /shared-budget/);
});

test('forbidden dependencies block even when every semantic claim says supported', async t => {
  const { assistant, input } = await setup(t, { ...request, alignment: { ...request.alignment!, forbiddenImports: [{ from: 'retry.ts', to: 'budget' }] } });
  const report = await assistant.assess(input);
  assert.equal(report.status, 'blocked');
  assert(report.blockers.some(b => b.includes('Forbidden dependency')));
});

test('confirming an attractive method requires its class and module context, and a distinct baseline alternative', async t => {
  const { assistant, input, evidence } = await setup(t);
  const fn = evidence.analysis!.segments.find(s => s.symbol === 'retryRequest')!;
  const report = await assistant.assess({ ...input, segmentIds: [fn.id], alternatives: input.alternatives.map(a => ({ ...a, kind: 'selected' })) });
  assert.equal(report.status, 'blocked');
  assert(report.blockers.some(b => b.includes('parent/module')));
  assert(report.blockers.some(b => b.includes('existing architecture')));
});

test('fabricated IDs, cross-evidence segments, missing task/constraints and duplicate claims cannot pass', async t => {
  const { assistant, input } = await setup(t);
  await assert.rejects(assistant.assess({ ...input, segmentIds: ['invented'] }), /cited inspected evidence/);
  await assert.rejects(assistant.assess({ ...input, evidenceIds: [] }), /cited inspected evidence/);
  await assert.rejects(assistant.assess({ ...input, claims: [...input.claims, input.claims[0]!] }), /Duplicate requirement/);
  await assert.rejects(assistant.assess({ ...input, claims: [{ ...input.claims[0]!, requirementId: 'invented' }] }), /outside this contract/);
  const missing = await assistant.assess({ ...input, claims: [input.claims[2]!] });
  assert(missing.blockers.some(b => b.startsWith('task: missing')));
  assert(missing.blockers.some(b => b.startsWith('constraint:1: missing')));
});

test('stale context and swapping strategies/evidence/assessment IDs cannot authorize a plan', async t => {
  const { assistant, input, check, root } = await setup(t);
  const ready = await assistant.assess(input);
  const decision = { checkId: check.id, choice: input.choice, candidateIds: input.candidateIds, evidenceIds: input.evidenceIds,
    alignmentId: ready.id, acknowledgeIncomplete: true, rationale: 'Use the inspected shared implementation with the verified references; unresolved callback behavior remains host-reviewed', status: 'planned' as const };
  await assert.rejects(assistant.decide({ ...decision, choice: 'reference_design' }), /match the decision strategy/);
  await assert.rejects(assistant.decide({ ...decision, evidenceIds: [] }), /Inspect each/);
  await writeFile(path.join(root, 'budget.js'), 'export const budget = 999;');
  await assert.rejects(assistant.decide(decision), /stale: budget.js/);
});

test('missing dependency context stays partial and requires explicit acknowledgement', async t => {
  const { assistant, check, candidate } = await setup(t);
  const evidence = await assistant.inspect(check.id, candidate.id);
  assert.equal(evidence.analysis!.coverage, 'partial');
  assert(evidence.analysis!.gaps.some(g => g.includes('no inspected target')));
  const ready = await assistant.assess(assessment(check, evidence));
  assert.equal(ready.status, 'ready');
  assert.equal(ready.coverage, 'partial');
  const decision = { checkId: check.id, choice: 'reuse_local' as const, candidateIds: [candidate.id], evidenceIds: [evidence.id], alignmentId: ready.id, rationale: 'Proceed with explicitly acknowledged uninspected dependency behavior', status: 'planned' as const };
  await assert.rejects(assistant.decide(decision), /incomplete alignment context/);
  assert.equal((await assistant.decide({ ...decision, acknowledgeIncomplete: true })).status, 'planned');
});

test('unsupported languages, invalid syntax, excerpts and segment budgets remain visible through public inspection', async t => {
  const { assistant, check, candidate, root } = await setup(t);
  await writeFile(path.join(root, 'other.hs'), 'retryRequest = "text evidence"\n');
  await writeFile(path.join(root, 'invalid.js'), 'export function broken(');
  await writeFile(path.join(root, 'many.js'), Array.from({ length: 120 }, (_, i) => `function f${i}() { return ${i}; }`).join('\n'));
  const other = await assistant.inspect(check.id, candidate.id, ['other.hs', 'invalid.js']);
  assert(other.analysis!.segments.filter(s => ['other.hs', 'invalid.js'].includes(s.path)).every(s => s.kind === 'text'));
  assert(other.analysis!.gaps.some(g => g.includes('no structural parser')));
  assert(other.analysis!.gaps.some(g => g.includes('parse failed')));
  const excerpt = await assistant.inspect(check.id, candidate.id, ['budget.js#L1-L1']);
  // An explicit full one-line range is actually complete; partial range of retry.ts isn't.
  assert(excerpt.files.some(f => f.path === 'budget.js'));
  const partial = await assistant.inspect(check.id, candidate.id, ['retry.ts#L4-L8']);
  assert(partial.analysis!.gaps.some(g => g.includes('excerpted')));
  const bounded = await assistant.inspect(check.id, candidate.id, ['many.js']);
  assert.equal(bounded.analysis!.coverage, 'partial');
  assert(bounded.analysis!.segments.length <= 100);
  assert(bounded.analysis!.gaps.some(g => g.includes('budget')));
});

test('TSX declarations, dynamic imports, reexports and require edges are syntax facts; input code is never executed', async t => {
  const { assistant, check, candidate, root } = await setup(t);
  await writeFile(path.join(root, 'view.tsx'), 'globalThis.__reuseExecuted = true;\nexport const View = (p: {x: string}) => <div>{p.x}</div>;\nexport {x} from "./other.js";\nconst dep = require("fs");\nasync function load(name: string) { return import(name); }');
  const evidence = await assistant.inspect(check.id, candidate.id, ['view.tsx']);
  assert(evidence.analysis!.segments.some(s => s.symbol === 'View'));
  assert(evidence.analysis!.imports.some(e => e.specifier === './other.js' && e.kind === 'export'));
  assert(evidence.analysis!.imports.some(e => e.specifier === 'fs' && e.kind === 'require'));
  assert(evidence.analysis!.gaps.some(g => g.includes('nonliteral')));
  assert.equal((globalThis as any).__reuseExecuted, undefined);
});

test('new alignment contracts isolate cache/decision context and concurrent assessments are retained', async t => {
  const { assistant, check, input } = await setup(t);
  const changed = await assistant.check({ ...request, alignment: { requirements: [{ id: 'other', description: 'A different global requirement' }] } });
  assert.notEqual(check.contextHash, changed.contextHash);
  const results = await Promise.all([assistant.assess(input), assistant.assess(input)]);
  const stored = (await assistant.store.check(check.id))!;
  assert(results.every(r => stored.alignments!.some(s => s.id === r.id)));
  await assert.rejects(assistant.check({ ...request, alignment: { requirements: [{ id: 'task', description: 'reserved' }] } }), /reserved/);
});

test('compiled CLI exposes alignment contracts, AST inspection, assessment and the decision gate', { timeout: 20000 }, async t => {
  const { root } = await setup(t, request, 'import { getBudget } from "./budget.js"; export function retryRequest() { return getBudget(); }');
  await writeFile(path.join(root, 'budget.js'), 'export function getBudget() { return 3; }');
  const exec = promisify(execFile);
  const call = async (command: string, data: unknown) => {
    const file = path.join(root, 'request.json');
    await writeFile(file, JSON.stringify(data));
    const { stdout } = await exec(process.execPath, [cliPath, command, '--project', root, '--input', file, '--json']);
    return JSON.parse(stdout);
  };
  const check = await call('check', request);
  const candidate = check.candidates.find((c: any) => c.localPath === 'retry.ts');
  const evidence = await call('inspect', { checkId: check.id, candidateId: candidate.id, paths: ['budget.js'] });
  const edge = evidence.analysis.linkage.calls.find((c: any) => c.callee === 'getBudget');
  assert.equal(edge.status, 'resolved');
  assert.equal(evidence.analysis.segments.find((s: any) => s.id === edge.targetSegmentId).path, 'budget.js');
  const report = await call('assess', assessment(check, evidence));
  assert.equal(report.status, 'ready');
  assert(report.callContext.some((c: any) => c.edge.targetSegmentId === edge.targetSegmentId));
  const decision = await call('decide', { checkId: check.id, choice: 'reuse_local', candidateIds: [candidate.id], evidenceIds: [evidence.id], alignmentId: report.id, rationale: 'CLI confirms the shared deadline strategy with exact code references' });
  assert.equal(decision.alignmentId, report.id);
  const persisted = JSON.parse(await readFile(path.join(root, '.reuse-assistant/checks', `${check.id}.json`), 'utf8'));
  assert.equal(persisted.alignments[0].id, report.id);
});

test('real MCP stdio rejects missing alignment and completes the new check/inspect/assess/decide protocol', { timeout: 20000 }, async t => {
  const { root } = await setup(t, request, 'import { getBudget } from "./budget.js"; export function retryRequest() { return getBudget(); }');
  await writeFile(path.join(root, 'budget.js'), 'export function getBudget() { return 3; }');
  const client = new Client({ name: 'alignment-acceptance', version: '0.4.0' });
  t.after(() => client.close());
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [cliPath, 'mcp', '--project', root], stderr: 'pipe' }));
  const call = async (name: string, args: unknown) => {
    const r: any = await client.callTool({ name, arguments: args as Record<string, unknown> });
    assert.notEqual(r.isError, true, r.content?.[0]?.text);
    return JSON.parse(r.content[0].text);
  };
  const check = await call('check_reuse', request);
  assert.match(check.alignmentPrompt, /EVERY requirement/);
  const candidate = check.candidates.find((c: any) => c.localPath === 'retry.ts');
  const evidence = await call('inspect_candidate', { checkId: check.id, candidateId: candidate.id, paths: ['budget.js'] });
  const edge = evidence.analysis.linkage.calls.find((c: any) => c.callee === 'getBudget');
  assert.equal(edge.status, 'resolved');
  const input = { checkId: check.id, choice: 'reuse_local', candidateIds: [candidate.id], evidenceIds: [evidence.id], rationale: 'MCP confirms the shared deadline and cancellation requirements' };
  const rejected: any = await client.callTool({ name: 'record_decision', arguments: input });
  assert.equal(rejected.isError, true);
  const incompleteInput = assessment(check, evidence);
  const blocked = await call('assess_alignment', { ...incompleteInput, segmentIds: incompleteInput.segmentIds.filter(id => id !== edge.targetSegmentId) });
  assert.equal(blocked.status, 'blocked');
  assert(blocked.blockers.some((b: string) => b.includes('resolved callee/import context')));
  const report = await call('assess_alignment', assessment(check, evidence));
  assert.equal(report.status, 'ready');
  assert.equal((await call('record_decision', { ...input, alignmentId: report.id })).alignmentId, report.id);
});

test('local context paths cannot escape the project and failed reads remain public', async t => {
  const { root, assistant, check, candidate } = await setup(t);
  await mkdir(path.join(root, 'nested'));
  const evidence = await assistant.inspect(check.id, candidate.id, ['../outside.ts', 'missing.ts']);
  assert.equal(evidence.status, 'partial');
  assert(evidence.errors.some(e => e.includes('repository-relative')));
  assert(evidence.errors.some(e => e.includes('missing.ts')));
});

test('same-length excerpts from the same file have distinct provenance IDs and absolute line ranges', async t => {
  const { root, assistant, check, candidate } = await setup(t);
  await writeFile(path.join(root, 'ranges.js'), 'aaaa\nbbbb\ncccc');
  const evidence = await assistant.inspect(check.id, candidate.id, ['ranges.js#L1-L1', 'ranges.js#L2-L2']);
  const segments = evidence.analysis!.segments.filter(s => s.path === 'ranges.js');
  assert.equal(segments.length, 2);
  assert.notEqual(segments[0]!.id, segments[1]!.id);
  assert.notEqual(segments[0]!.sha256, segments[1]!.sha256);
  assert.deepEqual(segments.map(s => s.startLine), [1, 2]);
  assert.equal(segments[0]!.fileHash, segments[1]!.fileHash);
});

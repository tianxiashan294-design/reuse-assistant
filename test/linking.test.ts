import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ReuseAssistant } from '../src/core.js';
import type { AlignmentInput, Inspection } from '../src/types.js';
import { fixture } from './support.js';

async function setup(t: TestContext, entry: string, files: Record<string, string> = {}) {
  const root = await fixture(t);
  for (const [name, content] of Object.entries({ 'entry.ts': `// linkFixture\n${entry}`, ...files })) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), content);
  }
  const assistant = new ReuseAssistant(root);
  const check = await assistant.check({ task: 'Confirm linkFixture and its shared deadline dependencies', queries: ['linkFixture'], scope: 'local', alignment: { requirements: [] } });
  const candidate = check.candidates.find(c => c.localPath === 'entry.ts')!;
  const inspect = (paths = Object.keys(files)) => assistant.inspect(check.id, candidate.id, paths);
  return { root, assistant, check, candidate, inspect };
}
const linked = (e: Inspection, callee: string) => e.analysis!.linkage!.calls.filter(c => c.callee === callee);
const symbol = (e: Inspection, id?: string) => e.analysis!.segments.find(s => s.id === id)?.symbol;

test('public core links aliased imports and named reexports to hashed functions and requires the complete callee chain', async t => {
  const f = await setup(t, 'import { run as execute } from "./bridge.js";\nexport function entry() { return execute(); }', {
    'bridge.ts': 'export { retry as run } from "./worker.js";',
    'worker.ts': 'export function retry() { return 1; }',
  });
  const e = await f.inspect();
  const call = linked(e, 'execute')[0]!;
  assert.equal(call.status, 'resolved');
  assert.equal(symbol(e, call.targetSegmentId), 'retry');
  assert.equal(call.viaModuleIds!.length, 2);
  assert(e.analysis!.imports.some(i => i.targetPath === 'bridge.ts' && i.resolution === 'resolved'));
  const entry = e.analysis!.segments.find(s => s.symbol === 'entry')!;
  const base: AlignmentInput = { checkId: f.check.id, choice: 'reuse_local', candidateIds: [f.candidate.id], evidenceIds: [e.id],
    segmentIds: [entry.id, entry.parentId!], claims: [{ requirementId: 'task', verdict: 'supported', rationale: 'Host reviewed the fixture shared deadline and dependency context.', segmentIds: [entry.id] }],
    alternatives: [{ kind: 'keep_existing', summary: 'Keep the existing shared interface', tradeoffs: 'Existing ownership and behavior remain.' }, { kind: 'selected', summary: 'Reuse the inspected entry and dependency', tradeoffs: 'Needs callee context and a public integration check.' }],
    integration: { target: 'Shared entry module', compatibility: 'Preserve deadline ownership', validationPlan: 'Run the public interface with cancellation and dependency failure' } };
  const blocked = await f.assistant.assess(base);
  assert.equal(blocked.status, 'blocked');
  assert(blocked.blockers.some(b => b.includes(call.targetSegmentId!)));
  assert(call.viaModuleIds!.every(id => blocked.blockers.some(b => b.includes(id))));
  assert(blocked.callContext!.some(c => c.evidenceId === e.id && c.edge.targetSegmentId === call.targetSegmentId));
  const decision = { checkId: f.check.id, choice: 'reuse_local' as const, status: 'planned' as const, candidateIds: [f.candidate.id], evidenceIds: [e.id], rationale: 'Reuse the shared entry after confirming its statically known dependency chain' };
  await assert.rejects(f.assistant.decide({ ...decision, alignmentId: blocked.id, acknowledgeIncomplete: true }), /ready assess_alignment/);
  const ready = await f.assistant.assess({ ...base, segmentIds: e.analysis!.segments.map(s => s.id) });
  assert.equal(ready.status, 'ready');
  assert.match(ready.prompt, /unresolved call reasons/);
  assert.match(ready.prompt, /execute/);
  assert.equal((await f.assistant.decide({ ...decision, alignmentId: ready.id })).status, 'planned');
  const restricted = await f.assistant.check({ task: f.check.input.task, queries: ['linkFixture'], scope: 'local', alignment: { requirements: [], forbiddenImports: [{ from: 'bridge.ts', to: 'worker.ts' }] } });
  const restrictedEvidence = await f.assistant.inspect(restricted.id, f.candidate.id, ['bridge.ts', 'worker.ts']);
  const forbidden = await f.assistant.assess({ ...base, checkId: restricted.id, evidenceIds: [restrictedEvidence.id], segmentIds: restrictedEvidence.analysis!.segments.map(s => s.id) });
  assert.equal(forbidden.status, 'blocked');
  assert(forbidden.blockers.some(b => b.includes('Forbidden dependency')));
  // The same provenance still guards the complete dependency files at planning.
  await writeFile(path.join(f.root, 'worker.ts'), 'export function retry() { return 2; }');
  await assert.rejects(f.assistant.decide({ ...decision, alignmentId: ready.id }), /stale: worker.ts/);
});

test('default exports, explicit aliases, const arrows and extensionless index files link within the inspection', async t => {
  const f = await setup(t, 'import work from "./bridge";\nexport const entry = () => work?.();', {
    'bridge/index.ts': 'export { run as default } from "../worker.js";',
    'worker.ts': 'const execute = () => 42; export { execute as run };',
  });
  const e = await f.inspect();
  assert.equal(linked(e, 'work')[0]!.status, 'resolved');
  assert.equal(symbol(e, linked(e, 'work')[0]!.targetSegmentId), 'execute');
  assert(e.analysis!.imports.some(i => i.targetPath === 'bridge/index.ts'));
  await writeFile(path.join(f.root, 'worker.ts'), 'export default () => 1;');
  await writeFile(path.join(f.root, 'bridge/index.ts'), 'export { default } from "../worker.js";');
  const anonymous = await f.inspect();
  assert.equal(symbol(anonymous, linked(anonymous, 'work')[0]!.targetSegmentId), '<arrow>');
});

for (const [name, code] of [
  ['parameters', 'export function entry(run: Function) { return run(); }'],
  ['block destructuring', 'export function entry() { { const { fn: run } = supplied; run(); } }'],
  ['catch bindings', 'export function entry() { try { fail(); } catch ({ run }) { run(); } }'],
  ['loop bindings', 'export function entry() { for (let run of supplied) run(); }'],
  ['assignment', 'run = replacement; export function entry() { return run(); }'],
  ['destructuring assignment', '({ fn: run } = supplied); export function entry() { return run(); }'],
  ['loop assignment', 'for (run of supplied) {} export function entry() { return run(); }'],
  ['named expression', 'const inner = function run() { run(); }; export function entry() { run(); }'],
  ['dynamic eval scope', 'export function entry() { eval(source); return run(); }'],
] as const) test(`a ${name} cannot masquerade as a module import target`, async t => {
  const f = await setup(t, `import { run } from "./worker.js"; ${code}`, { 'worker.ts': 'export function run() { return 1; }' });
  const e = await f.inspect();
  assert(linked(e, 'run').length > 0);
  assert(linked(e, 'run').every(c => c.status === 'unresolved' && /Shadowed|dynamic scope/.test(c.reason!)));
});

test('mutable declarations and exported assignments never become stable callable targets', async t => {
  const f = await setup(t, 'import { run, other } from "./worker.js"; export function entry() { run(); other(); }', {
    'worker.ts': 'export function run() {} run = replacement; export let other = () => 1;',
  });
  const e = await f.inspect();
  assert(linked(e, 'run').every(c => c.status === 'unresolved' && /reassigned/.test(c.reason!)));
  assert(linked(e, 'other').every(c => c.status === 'unresolved' && /stable top-level/.test(c.reason!)));
});

test('nested names stay conservative while unique top-level functions and recursion are linked', async t => {
  const f = await setup(t, 'function run() { return run(); } export function entry() { return run(); } function outer() { function inner() {} inner(); }');
  const e = await f.inspect();
  assert.equal(linked(e, 'run').length, 2);
  assert(linked(e, 'run').every(c => c.status === 'resolved' && symbol(e, c.targetSegmentId) === 'run'));
  assert(linked(e, 'inner').every(c => c.status === 'unresolved'));
});

test('missing, ambiguous, invalid, excerpted and duplicate file evidence withholds targets with distinct reasons', async t => {
  const f = await setup(t, 'import { run } from "./worker.js"; export function entry() { return run(); }', {
    'worker.ts': 'export function run() {\n return 1;\n}', 'worker.js': 'export function run() { return 2; }',
  });
  const missing = await f.inspect([]);
  assert.equal(missing.analysis!.imports[0]!.resolution, 'missing');
  const ambiguous = await f.inspect();
  assert.equal(ambiguous.analysis!.imports[0]!.resolution, 'ambiguous');
  assert.equal(linked(ambiguous, 'run')[0]!.status, 'unresolved');
  const excerpt = await f.inspect(['worker.ts#L1-L1']);
  assert.equal(excerpt.analysis!.imports[0]!.resolution, 'unsupported');
  const duplicate = await f.inspect(['worker.ts', 'worker.ts#L1-L1']);
  assert.equal(duplicate.analysis!.imports[0]!.resolution, 'ambiguous');
  await writeFile(path.join(f.root, 'worker.ts'), 'export function run(');
  const invalid = await f.inspect(['worker.ts']);
  assert.equal(invalid.analysis!.imports[0]!.resolution, 'unsupported');
  for (const e of [missing, ambiguous, excerpt, duplicate, invalid]) {
    assert.equal(e.analysis!.coverage, 'partial');
    assert.equal(e.analysis!.linkage!.coverage, 'partial');
    assert(!linked(e, 'run').some(c => c.targetSegmentId));
  }
});

test('type-only bindings, namespace/member calls, external packages and export-star remain explicit unknowns', async t => {
  const f = await setup(t, 'import { type run } from "./worker.js"; import * as ns from "./worker.js"; import pkg from "external-package"; import { hidden } from "./bridge.js"; export function entry() { run(); ns.run(); pkg(); hidden(); import("./worker.js"); }', {
    'worker.ts': 'export function run() {} export function hidden() {}',
    'bridge.ts': 'export * from "./worker.js";',
  });
  const e = await f.inspect();
  assert(e.analysis!.linkage!.calls.every(c => c.status === 'unresolved' && c.reason));
  assert.match(linked(e, 'run')[0]!.reason!, /Type-only/);
  assert.match(linked(e, 'ns.run')[0]!.reason!, /runtime dispatch/);
  assert.match(linked(e, 'hidden')[0]!.reason!, /export-star/);
  assert.equal(e.analysis!.imports.find(i => i.specifier === 'external-package')!.resolution, 'external');
});

test('cyclic named reexports terminate with a visible reason instead of inventing a target', async t => {
  const f = await setup(t, 'import { run } from "./a.js"; export function entry() { run(); }', {
    'a.ts': 'export { run } from "./b.js";', 'b.ts': 'export { run } from "./a.js";',
  });
  const e = await f.inspect();
  assert.equal(linked(e, 'run')[0]!.status, 'unresolved');
  assert.match(linked(e, 'run')[0]!.reason!, /cycle/);
});

test('call and AST budgets stay bounded and incompletely traversed modules cannot supply callable targets', async t => {
  const f = await setup(t, 'import { run } from "./worker.js"; export function entry() { run(); }', {
    'worker.ts': `export function run() {}\n${Array.from({ length: 110 }, (_, i) => `function f${i}() {}`).join('\n')}`,
  });
  const incomplete = await f.inspect();
  assert.equal(incomplete.analysis!.imports[0]!.resolution, 'unsupported');
  assert.equal(linked(incomplete, 'run')[0]!.status, 'unresolved');
  await writeFile(path.join(f.root, 'worker.ts'), 'export function run() {}');
  await writeFile(path.join(f.root, 'entry.ts'), `// linkFixture\nfunction run() {}\n${'run();'.repeat(350)}`);
  const calls = await f.inspect();
  assert.equal(calls.analysis!.linkage!.calls.length, 300);
  assert.equal(calls.analysis!.linkage!.coverage, 'partial');
  assert(calls.analysis!.linkage!.gaps.some(g => g.includes('300')));
  const report = await f.assistant.assess({ checkId: f.check.id, choice: 'reuse_local', candidateIds: [f.candidate.id], evidenceIds: [calls.id],
    segmentIds: calls.analysis!.segments.map(s => s.id), claims: [{ requirementId: 'task', verdict: 'supported', rationale: 'Host accepts the finite inspection for this fixture, not a complete graph.', segmentIds: [calls.analysis!.segments[0]!.id] }],
    alternatives: [{ kind: 'keep_existing', summary: 'Keep shared behavior', tradeoffs: 'Keep existing ownership.' }, { kind: 'selected', summary: 'Reuse inspected code', tradeoffs: 'Explicitly incomplete call coverage.' }],
    integration: { target: 'Shared module', compatibility: 'Retain ownership', validationPlan: 'Run the whole public interface' } });
  assert.equal(report.status, 'ready');
  assert.equal(report.coverage, 'partial');
  assert(report.gaps.some(g => g.includes('300')));
  await assert.rejects(f.assistant.decide({ checkId: f.check.id, status: 'planned', choice: 'reuse_local', candidateIds: [f.candidate.id], evidenceIds: [calls.id], alignmentId: report.id, rationale: 'This plan must not hide the truncated call-link coverage' }), /incomplete alignment context/);
});

test('incoming callers are reported even when only the callee and its parent are selected', async t => {
  const f = await setup(t, 'function run() {} export function entry() { run(); }');
  const e = await f.inspect();
  const callee = e.analysis!.segments.find(s => s.symbol === 'run')!;
  const report = await f.assistant.assess({ checkId: f.check.id, choice: 'reuse_local', candidateIds: [f.candidate.id], evidenceIds: [e.id], segmentIds: [callee.id, callee.parentId!],
    claims: [{ requirementId: 'task', verdict: 'supported', rationale: 'Host reviews the incoming caller and keeps the shared contract.', segmentIds: [callee.id] }],
    alternatives: [{ kind: 'keep_existing', summary: 'Keep interface', tradeoffs: 'Retain ownership.' }, { kind: 'selected', summary: 'Reuse callee', tradeoffs: 'Review incoming caller and validate together.' }],
    integration: { target: 'Shared run function', compatibility: 'Retain caller contract', validationPlan: 'Run caller through the public interface' } });
  assert.equal(report.status, 'ready');
  assert(report.callContext!.some(c => c.edge.targetSegmentId === callee.id && symbol(e, c.edge.fromSegmentId) === 'entry'));
});

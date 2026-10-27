import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ReuseAssistant } from '../src/core.js';
import type { Candidate, Inspection, RemoteSource } from '../src/types.js';

// Real public endpoints through the shared core. No model, no candidate execution.
// Persist failures too; offline tests and host activation are separate evidence.
const assistant = new ReuseAssistant(process.cwd());
const startedAt = new Date().toISOString();
const cases: { source: RemoteSource; query: string; expected: string; paths?: string[] }[] = [
  { source: 'gitlab', query: 'https://gitlab.com/libeigen/eigen', expected: 'gitlab:libeigen/eigen', paths: ['CMakeLists.txt#L1-L35'] },
  { source: 'crates', query: 'serde_json', expected: 'crates:serde_json', paths: ['Cargo.toml'] },
  { source: 'maven', query: 'g:com.google.code.gson AND a:gson', expected: 'maven:com.google.code.gson:gson' },
  { source: 'nuget', query: 'Newtonsoft.Json', expected: 'nuget:Newtonsoft.Json' },
  { source: 'rubygems', query: 'rake', expected: 'rubygems:rake' },
  { source: 'packagist', query: 'monolog/monolog', expected: 'packagist:monolog/monolog', paths: ['composer.json'] },
];
const summarizeEvidence = (e?: Inspection) => e ? { id: e.id, status: e.status, metadata: e.metadata, errors: e.errors, notes: e.notes, files: e.files.map(({ content: _content, ...f }) => f) } : null;
const observations = [];
for (const c of cases) {
  const check = await assistant.check({ task: `v0.2 live observation of ${c.source}`, queries: [c.query], sources: [c.source], scope: 'full', useCache: false, budgetMs: 25000 });
  const candidate: Candidate | undefined = check.candidates.find(p => p.id === c.expected || p.aliases?.includes(c.expected));
  const evidence = candidate ? await assistant.inspect(check.id, c.expected, c.paths ?? [], 60000) : undefined;
  const entry = { source: c.source, query: c.query, checkId: check.id, coverage: check.coverage, sources: check.sources.filter(s => s.source !== 'local'), candidate: candidate ? { id: candidate.id, packages: candidate.packages } : null, evidence: summarizeEvidence(evidence) };
  observations.push(entry);
  console.log(JSON.stringify({ source: c.source, search: entry.sources.map(s => s.status), candidate: Boolean(candidate), evidence: evidence?.status, files: evidence?.files.length, errors: evidence?.errors }));
}
const result = { startedAt, finishedAt: new Date().toISOString(), node: process.version, observations, note: 'Live endpoint observations only. Errors/partial evidence are retained; this is not exhaustive language/platform coverage, a recall benchmark, or proof of new Codex host activation.' };
const output = path.resolve('docs/live-smoke-v2.json');
let previousRuns: unknown[] = [];
try {
  const previous = JSON.parse(await readFile(output, 'utf8'));
  const { previousRuns: history, ...run } = previous;
  previousRuns = [...(history ?? []), run];
} catch (error: any) { if (error.code !== 'ENOENT') throw error; }
await writeFile(output, JSON.stringify({ ...result, previousRuns }, null, 2) + '\n');
if (observations.some(o => !o.candidate || !o.evidence?.files.some(f => f.ref) || (o.source !== 'gitlab' && !(o.evidence?.metadata.registry as any)?.version))) process.exitCode = 1;

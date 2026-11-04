import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ReuseAssistant } from '../src/core.js';
import type { RemoteSource } from '../src/types.js';

// Real shared-core requests; preserve failures and do not execute candidate code.
const selected = process.argv.slice(2);
if (selected.some(s => s !== 'pub' && s !== 'hex')) throw new Error('Select pub and/or hex');
const core = new ReuseAssistant(process.cwd());
const observations = [];
const startedAt = new Date().toISOString();
for (const source of (selected.length ? selected : ['pub', 'hex']) as RemoteSource[]) {
  const query = source === 'pub' ? 'http' : 'jason';
  const check = await core.check({ task: `v0.7 live ${source} source observation`, queries: [query], sources: [source], maxPages: 2, useCache: false, budgetMs: 30000 });
  const result = check.sources.find(s => s.source === source)!;
  const alias = `${source}:${query}`;
  const candidate = check.candidates.find(c => c.id === alias || c.aliases?.includes(alias));
  const e = candidate ? await core.inspect(check.id, alias, [], 30000) : undefined;
  const registry = e?.metadata.registry as { version?: string } | undefined;
  const passed = ['ok', 'empty'].includes(result.status) && Boolean(candidate && registry?.version && e?.files.some(f => f.ref === registry.version));
  observations.push({ source, query, checkId: check.id, passed, result,
    evidence: e ? { id: e.id, status: e.status, metadata: e.metadata, notes: e.notes, errors: e.errors, files: e.files.map(({ content: _content, ...f }) => f) } : undefined });
  console.log(JSON.stringify({ source, status: result.status, candidates: result.candidates.length, passed, version: registry?.version, errors: e?.errors }));
}
const run = { startedAt, finishedAt: new Date().toISOString(), node: process.version, passed: observations.every(o => o.passed), observations,
  note: 'Live bounded source and pinned metadata observations only. pub is official top-name matching, not full-text discovery; Hex searches package names/descriptions. Partial code/license coverage and failures are retained. No archive execution, recall benchmark, remote CI, or desktop reload is claimed.' };
const target = path.resolve('docs/live-smoke-v7.json');
let runs: unknown[] = [];
try { runs = JSON.parse(await readFile(target, 'utf8')).runs; }
catch (error: any) { if (error.code !== 'ENOENT') throw error; }
await writeFile(target, JSON.stringify({ runs: [...runs, run] }, null, 2) + '\n');
if (!run.passed) process.exitCode = 1;

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ReuseAssistant } from '../src/core.js';
import { REMOTE_SOURCES, type RemoteSource } from '../src/types.js';

// Real public core/HTTP requests. No injected fixtures and no candidate execution.
const selected = process.argv.slice(2);
if (selected.some(s => !REMOTE_SOURCES.includes(s as RemoteSource) || s === 'pypi' || s === 'pub')) throw new Error('Select numbered remote discovery sources; use smoke:v7 for the pub name corpus');
const sources = (selected.length ? selected : REMOTE_SOURCES.filter(s => s !== 'pypi' && s !== 'pub')) as RemoteSource[];
const assistant = new ReuseAssistant(process.cwd());
const startedAt = new Date().toISOString();
const observations = [];
for (const source of sources) {
  const check = await assistant.check({ task: `v0.3 live pagination observation of ${source}`, queries: ['json'], sources: [source], maxPages: 2, useCache: false, budgetMs: 30000 });
  const result = check.sources.find(s => s.source === source)!;
  const passed = result.status === 'ok' && result.pagination?.pagesFetched === 2 && result.candidates.length > result.pagination.pageSize;
  const observation = { source, checkId: check.id, query: 'json', passed, status: result.status, elapsedMs: check.elapsedMs, count: result.candidates.length, pagination: result.pagination, error: result.error, notes: result.notes, candidates: result.candidates.map(c => ({ id: c.id, version: c.version })) };
  observations.push(observation);
  console.log(JSON.stringify({ ...observation, candidates: undefined }));
}
const result = { startedAt, finishedAt: new Date().toISOString(), node: process.version, passed: observations.every(o => o.passed), observations, note: 'Live endpoint pagination samples only, not a recall benchmark, remote CI result or Codex desktop reload/activation claim. Prior failures are retained in runs.' };
const target = path.resolve('docs/live-smoke-v3.json');
let runs: unknown[] = [];
try {
  const previous = JSON.parse(await readFile(target, 'utf8'));
  runs = previous.runs ?? [previous];
} catch (error: any) { if (error.code !== 'ENOENT') throw error; }
await writeFile(target, JSON.stringify({ runs: [...runs, result] }, null, 2) + '\n');
if (!result.passed) process.exitCode = 1;

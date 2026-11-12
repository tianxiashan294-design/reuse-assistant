import { writeFile } from 'node:fs/promises';
import { ReuseAssistant } from '../src/core.js';

// Low-volume observation, separate from deterministic acceptance fixtures.
const report = await new ReuseAssistant(process.cwd()).check({
  task: 'Observe bounded official keyset and NuGet search endpoints', queries: ['json'],
  sources: ['gitlab', 'nuget'], maxPages: 2, maxRetries: 1, budgetMs: 20_000, useCache: false,
});
const observation = {
  observedAt: new Date().toISOString(), interface: 'public core, live network', checkId: report.id,
  input: report.input, coverage: report.coverage, elapsedMs: report.elapsedMs,
  sources: report.sources.filter(source => source.source !== 'local'),
  local: report.sources.filter(source => source.source === 'local').map(source => ({ status: source.status, notes: source.notes, error: source.error })),
  notes: ['One observation is not an uptime, full-recall or host-activation claim.', 'No synthetic upstream outage was introduced; successful primary reads do not prove live fallback was exercised.'],
};
await writeFile('docs/live-smoke-reliability.json', JSON.stringify(observation, null, 2) + '\n');
console.log(JSON.stringify({ checkId: report.id, sources: observation.sources.map(source => ({ source: source.source, status: source.status, candidates: source.candidates.length, pagination: source.pagination, failures: source.failures, error: source.error })) }, null, 2));

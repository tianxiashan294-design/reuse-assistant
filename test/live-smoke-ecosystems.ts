import { writeFile } from 'node:fs/promises';
import { ReuseAssistant } from '../src/core.js';
import type { Inspection } from '../src/types.js';

const core = new ReuseAssistant(process.cwd());
const report = await core.check({ task: 'Observe official Clojars/Hackage/MetaCPAN discovery and fixed metadata', queries: ['json'], sources: ['clojars', 'hackage', 'metacpan'], maxPages: 2, budgetMs: 30_000, useCache: false });
const inspections: Inspection[] = [];
for (const source of ['clojars', 'hackage', 'metacpan'] as const) {
  const selected = report.candidates.find(candidate => candidate.packages?.some(pkg => pkg.source === source && (source !== 'clojars' || !/-SNAPSHOT$/i.test(pkg.version ?? ''))));
  const pkg = selected?.packages?.find(pkg => pkg.source === source);
  if (pkg) inspections.push(await core.inspect(report.id, `${source}:${pkg.name}`, [], 20_000));
}
const observation = {
  observedAt: new Date().toISOString(), interface: 'public core, live network', checkId: report.id, input: report.input,
  coverage: report.coverage, elapsedMs: report.elapsedMs, sources: report.sources.filter(source => source.source !== 'local'),
  local: report.sources.filter(source => source.source === 'local').map(source => ({ status: source.status, notes: source.notes, error: source.error })),
  inspections: inspections.map(inspection => ({ candidateId: inspection.candidateId, status: inspection.status, metadata: inspection.metadata, errors: inspection.errors, notes: inspection.notes, files: inspection.files.map(file => ({ path: file.path, url: file.url, ref: file.ref, sha256: file.sha256, truncated: file.truncated })) })),
  notes: ['Independent low-volume observation, not uptime/full recall or host activation.', 'Source archive bytes were not downloaded; metadata checksums and repository links do not prove release-source correspondence.'],
};
await writeFile('docs/live-smoke-ecosystems.json', JSON.stringify(observation, null, 2) + '\n');
console.log(JSON.stringify({ checkId: report.id, sources: observation.sources.map(source => ({ source: source.source, status: source.status, candidates: source.candidates.length, pagination: source.pagination, error: source.error, failures: source.failures })), inspections: observation.inspections.map(inspection => ({ candidateId: inspection.candidateId, status: inspection.status, errors: inspection.errors, files: inspection.files })) }, null, 2));

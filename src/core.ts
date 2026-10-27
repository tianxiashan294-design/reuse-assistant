import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { Http } from './http.js';
import { digest, projectFingerprint, searchLocal } from './project.js';
import { mergeCandidates, searchGitHub, searchGitLab, searchNpm, verifyPypi } from './sources.js';
import { searchRegistry } from './registries.js';
import { SOURCE_CATALOG, selectedSources } from './catalog.js';
import { inspectCandidate } from './inspect.js';
import { Store } from './store.js';
import { decisionNextAction } from './format.js';
import type { CheckInput, CheckReport, Decision, DecisionInput, Inspection, SourceResult } from './types.js';
import { ECOSYSTEMS } from './types.js';

const context = (input: CheckInput, fingerprint: string) => digest({ task: input.task, queries: input.queries, constraints: input.constraints ?? [], scope: input.scope, ecosystem: input.ecosystem, packages: input.packageNames ?? [], ...(input.sources ? { sources: input.sources } : {}), fingerprint });

export class ReuseAssistant {
  readonly store: Store;
  private inspectionQueue = Promise.resolve();
  constructor(readonly projectRoot: string, readonly http = new Http()) { this.store = new Store(projectRoot); }

  async check(input: CheckInput): Promise<CheckReport> {
    if (!input.task.trim() || !input.queries.length || input.queries.length > 3 || input.queries.some(q => !q.trim() || q.length > 300)) throw new Error('Provide a task and 1–3 nonempty queries (up to 300 characters each)');
    if (input.task.length > 4000 || (input.constraints?.length ?? 0) > 20 || (input.packageNames?.length ?? 0) > 3) throw new Error('Request exceeds the supported task/constraint/package limits');
    if (input.ecosystem && !ECOSYSTEMS.includes(input.ecosystem)) throw new Error('Unsupported ecosystem');
    if (input.scope && !['local', 'full'].includes(input.scope)) throw new Error('Unsupported scope');
    const selection = selectedSources(input);
    if (!input.sources && input.queries.some(q => /^@[\w.-]+\/[\w.-]+$/.test(q.trim())) && !selection.includes('npm')) selection.push('npm');
    if (input.scope !== 'local' && input.packageNames?.length && !selection.includes('pypi')) throw new Error('packageNames verifies PyPI distributions; include pypi in sources');
    const start = performance.now();
    const root = await realpath(this.projectRoot);
    const fingerprint = await projectFingerprint(root);
    const normalized: CheckInput = { ...input, queries: [...new Set(input.queries.map(q => q.trim()))], scope: input.scope ?? 'full', ecosystem: input.ecosystem ?? 'auto', sources: input.scope === 'local' ? [] : selection };
    const contextHash = context(normalized, fingerprint);
    const signal = AbortSignal.timeout(Math.max(100, Math.min(120_000, input.budgetMs ?? 60_000)));
    const localPromise = searchLocal(root, normalized.queries, signal);
    const cached = normalized.scope === 'full' && input.useCache !== false ? await this.store.cache(contextHash) : undefined;
    let remote: SourceResult[] = cached?.results ?? [];
    if (!cached && normalized.scope === 'full') {
      const jobs: (() => Promise<SourceResult>)[] = [];
      for (const q of normalized.queries) {
        const scopedNpm = !input.sources && /^@[\w.-]+\/[\w.-]+$/.test(q);
        for (const source of selection) {
          if (source === 'pypi') continue;
          if (scopedNpm && source !== 'npm') {
            jobs.push(async () => ({ source, query: q, status: 'skipped', candidates: [], elapsedMs: 0, notes: ['Exact scoped npm query routed to npm only.'] }));
          } else if (source === 'github') jobs.push(() => searchGitHub(this.http, q, signal));
          else if (source === 'gitlab') jobs.push(() => searchGitLab(this.http, q, signal));
          else if (source === 'npm') jobs.push(() => searchNpm(this.http, q, signal));
          else jobs.push(() => searchRegistry(this.http, source, q, signal));
        }
      }
      for (const name of normalized.packageNames ?? []) jobs.push(() => verifyPypi(this.http, name, signal));
      // Bounded workers preserve source order and isolate failures.
      const results: SourceResult[] = [];
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
        while (next < jobs.length) {
          const i = next++;
          results[i] = await jobs[i]!();
        }
      }));
      remote = results;
      if (selection.includes('pypi') && !normalized.packageNames?.length) remote.push({ source: 'pypi', query: '', status: 'skipped', candidates: [], elapsedMs: 0, notes: ['Discover Python projects via repository search; inspect installation/project metadata to identify a distribution, then verify it with PyPI. PyPI full-text search is not available.'] });
      if (remote.every(r => ['ok', 'empty', 'skipped'].includes(r.status))) await this.store.saveCache(contextHash, remote);
    }
    const local = await localPromise;
    const sources = [local, ...remote];
    const report: CheckReport = {
      id: randomUUID(), createdAt: new Date().toISOString(), projectRoot: root, contextHash, input: normalized,
      coverage: sources.some(r => !['ok', 'empty', 'skipped'].includes(r.status)) ? 'partial' : 'complete',
      cached: Boolean(cached), cacheCreatedAt: cached?.createdAt, elapsedMs: Math.round(performance.now() - start),
      sources, candidates: mergeCandidates(sources.flatMap(r => r.candidates), normalized.queries), inspections: [],
      sourcePlan: SOURCE_CATALOG.map(s => ({ ...s, selected: normalized.sources!.includes(s.source) })),
      notes: ['Complete means the bounded query plan finished, not exhaustive ecosystem or all-platform coverage.', 'At most 8 local matches appear in the merged shortlist; source results retain additional matches. Each returning remote source keeps a representative when possible.', 'Exact scoped npm names are routed to npm unless explicit sources override routing.', 'Go currently uses repository search; no Go registry full-text adapter is implemented.', 'Host must inspect relevant evidence and judge requirement fit; health signals do not authorize adoption.', ...(normalized.queries.some(q => /\p{Script=Han}/u.test(q)) ? ['Chinese queries are preserved. Add English technical synonyms when useful; this tool does not translate or invent them.'] : [])],
    };
    if (normalized.binding) {
      const gate = await this.store.gate(normalized.binding.sessionId);
      if (!gate || gate.binding.turnId !== normalized.binding.turnId) throw new Error('Session/turn binding is stale or was not initialized by the client hook');
    }
    await this.store.saveCheck(report);
    return report;
  }

  async inspect(checkId: string, candidateId: string, paths: string[] = [], budgetMs?: number): Promise<Inspection> {
    // Serialize report updates so concurrent MCP inspections cannot lose evidence.
    const previous = this.inspectionQueue;
    let release!: () => void;
    this.inspectionQueue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try {
      const check = await this.store.check(checkId);
      if (!check) throw new Error('Unknown check');
      const candidate = check.candidates.find(c => c.id === candidateId || c.aliases?.includes(candidateId));
      if (!candidate) throw new Error('Candidate does not belong to this check');
      if (paths.length > 5) throw new Error('Inspect up to five specific repository paths per call');
      const already = new Set(check.inspections.map(i => i.candidateId));
      if (!already.has(candidate.id) && already.size >= 3) throw new Error('Three distinct candidates have been inspected; refine the task or start a new check');
      const requestedPackage = candidate.packages?.find(p => `${p.source}:${p.name}` === candidateId);
      const target = requestedPackage ? { ...candidate, source: requestedPackage.source, name: requestedPackage.name, version: requestedPackage.version, packages: [requestedPackage] } : candidate;
      const inspection = await inspectCandidate(this.http, this.projectRoot, target, paths, budgetMs);
      check.inspections.push(inspection);
      await this.store.saveCheck(check);
      return inspection;
    } finally { release(); }
  }

  async decide(input: DecisionInput): Promise<Decision> {
    const check = await this.store.check(input.checkId);
    if (!check) throw new Error('Unknown check');
    if (input.rationale.trim().length < 12) throw new Error('Explain requirement fit or concrete gaps in the rationale');
    const actualHash = context(check.input, await projectFingerprint(this.projectRoot));
    if (input.status === 'planned' && actualHash !== check.contextHash) throw new Error('Project dependency context changed; run a fresh check');
    if (input.status !== 'planned') {
      const previous = input.previousDecisionId ? await this.store.decision(input.previousDecisionId) : undefined;
      const expectedStatus = input.status === 'applied' ? 'planned' : 'applied';
      if (!previous || previous.checkId !== check.id || previous.status !== expectedStatus || previous.choice !== input.choice || JSON.stringify(previous.candidateIds ?? []) !== JSON.stringify(input.candidateIds ?? [])) {
        throw new Error(`Link the preceding ${expectedStatus} decision for this same choice and candidates`);
      }
    }
    if (Date.now() - Date.parse(check.createdAt) > 6 * 60 * 60 * 1000) throw new Error('Check expired; run a fresh check');
    if ((check.coverage === 'partial' || input.choice === 'incomplete_continue') && !input.acknowledgeIncomplete) throw new Error('Acknowledge the incomplete check explicitly before proceeding');
    const needsCandidate = ['reuse_local', 'adopt_dependency', 'adapt_code', 'reference_design'].includes(input.choice);
    const ids = input.candidateIds ?? [];
    const chosen = ids.map(id => {
      const candidate = check.candidates.find(c => c.id === id);
      if (!candidate) throw new Error('Decision references a candidate outside this check');
      return candidate;
    });
    if (needsCandidate && !chosen.length) throw new Error('This choice requires a candidate');
    const evidence = (input.evidenceIds ?? []).map(id => {
      const inspection = check.inspections.find(i => i.id === id);
      if (!inspection) throw new Error('Decision references evidence outside this check');
      return inspection;
    });
    for (const candidate of chosen) {
      const relevant = evidence.filter(i => i.candidateId === candidate.id && i.files.length > 0);
      if (needsCandidate && !relevant.length) throw new Error('Inspect each chosen candidate and cite its evidence before adoption');
      if (relevant.some(i => i.status === 'partial') && !input.acknowledgeIncomplete) throw new Error('Acknowledge incomplete candidate evidence explicitly before proceeding');
      if (input.choice === 'reuse_local' && candidate.source !== 'local') throw new Error('reuse_local requires a local candidate');
      if (input.choice === 'adapt_code') {
        if (!relevant.some(i => i.metadata.license && i.files.some(f => /\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|cs|rb|php)$/i.test(f.path)))) throw new Error('Code adaptation requires code-file evidence and an identified license');
      }
    }
    if (input.status === 'verified' && (!input.validation || input.validation.trim().length < 12)) throw new Error('Verified decisions require a host-reported validation command and outcome');
    const nextAction = decisionNextAction(input.status);
    const decision: Decision = { ...input, id: randomUUID(), createdAt: new Date().toISOString(), contextHash: check.contextHash, binding: check.input.binding, resultingFingerprint: await projectFingerprint(this.projectRoot), nextAction };
    await this.store.saveDecision(decision);
    await this.store.linkDecision(check.id, decision.id);
    if (decision.binding) {
      const gate = await this.store.gate(decision.binding.sessionId);
      if (!gate || gate.binding.turnId !== decision.binding.turnId) throw new Error('Cannot unlock a different or stale client turn');
      await this.store.saveGate({ ...gate, decisionId: decision.id, checkId: check.id });
    }
    return decision;
  }
}

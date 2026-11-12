import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { Http } from './http.js';
import { digest, projectFingerprint, searchLocal } from './project.js';
import { mergeCandidates, searchGitHub, searchGitLab, searchNpm, verifyPypi } from './sources.js';
import { readPubCatalog, searchPub, searchRegistry, type PubCatalog, type RegistrySearchState } from './registries.js';
import { SOURCE_CATALOG, selectedSources } from './catalog.js';
import { searchPages, type SearchJob } from './pagination.js';
import { planQueries } from './queries.js';
import { cppCatalogSearch } from './cpp-catalog.js';
import { validateGoModules, verifyGoModule } from './go-proxy.js';
import { inspectCandidate } from './inspect.js';
import { Store } from './store.js';
import { decisionNextAction } from './format.js';
import { analyzeCode, isCodePath } from './segments.js';
import { alignmentContractSchema, alignmentPrompt, assessAlignment, validateAlignmentDecision } from './alignment.js';
import type { AlignmentInput, AlignmentReport, CheckInput, CheckReport, Decision, DecisionInput, Inspection, SourceResult } from './types.js';
import { ECOSYSTEMS } from './types.js';

const context = (input: CheckInput, fingerprint: string) => digest({ task: input.task, queries: input.queries, constraints: input.constraints ?? [], scope: input.scope, ecosystem: input.ecosystem, packages: input.packageNames ?? [], ...(input.goModules?.length ? { goModules: input.goModules } : {}), ...(input.sources ? { sources: input.sources } : {}), ...(input.maxPages !== undefined ? { maxPages: input.maxPages } : {}), ...(input.maxRetries !== undefined ? { maxRetries: input.maxRetries } : {}), ...(input.queryVariants !== undefined ? { queryVariants: input.queryVariants } : {}), ...(input.alignment ? { alignment: input.alignment } : {}), fingerprint });

export class ReuseAssistant {
  readonly store: Store;
  private inspectionQueue = Promise.resolve();
  constructor(readonly projectRoot: string, readonly http = new Http()) { this.store = new Store(projectRoot); }

  async check(input: CheckInput): Promise<CheckReport> {
    if (input.alignment) input = { ...input, alignment: alignmentContractSchema.parse(input.alignment) };
    if (!input.task.trim() || !input.queries.length || input.queries.length > 3 || input.queries.some(q => !q.trim() || q.length > 300)) throw new Error('Provide a task and 1–3 nonempty queries (up to 300 characters each)');
    if (input.task.length > 4000 || (input.constraints?.length ?? 0) > 20 || (input.packageNames?.length ?? 0) > 3) throw new Error('Request exceeds the supported task/constraint/package limits');
    if (input.ecosystem && !ECOSYSTEMS.includes(input.ecosystem)) throw new Error('Unsupported ecosystem');
    if (input.scope && !['local', 'full'].includes(input.scope)) throw new Error('Unsupported scope');
    if (input.maxPages !== undefined && (!Number.isInteger(input.maxPages) || input.maxPages < 1 || input.maxPages > 3)) throw new Error('maxPages must be an integer from 1 to 3');
    if (input.maxRetries !== undefined && (!Number.isInteger(input.maxRetries) || input.maxRetries < 0 || input.maxRetries > 1)) throw new Error('maxRetries must be an integer from 0 to 1');
    const queryPlan = planQueries(input.queries, input.queryVariants);
    validateGoModules(input.goModules);
    const selection = selectedSources(input);
    if (!input.sources && queryPlan.executed.some(q => /^@[\w.-]+\/[\w.-]+$/.test(q)) && !selection.includes('npm')) selection.push('npm');
    if (input.scope !== 'local' && input.packageNames?.length && !selection.includes('pypi')) throw new Error('packageNames verifies PyPI distributions; include pypi in sources');
    if (input.scope !== 'local' && input.goModules?.length && !selection.includes('goproxy')) throw new Error('goModules verifies Go modules; include goproxy in sources');
    const start = performance.now();
    const root = await realpath(this.projectRoot);
    const fingerprint = await projectFingerprint(root);
    const normalized: CheckInput = { ...input, queries: queryPlan.originals, ...(queryPlan.variants !== undefined ? { queryVariants: queryPlan.variants } : {}), scope: input.scope ?? 'full', ecosystem: input.ecosystem ?? 'auto', sources: input.scope === 'local' ? [] : selection, maxPages: input.maxPages ?? 2, maxRetries: input.maxRetries ?? 1 };
    const contextHash = context(normalized, fingerprint);
    // New discovery semantics must not consume a pre-keyset remote cache.
    // Keep decision context hashes unchanged for existing saved checks.
    const cacheKey = digest({ contextHash, discoveryRevision: 2 });
    const signal = AbortSignal.timeout(Math.max(100, Math.min(120_000, input.budgetMs ?? 60_000)));
    const localPromise = searchLocal(root, queryPlan.executed, signal);
    const cached = normalized.scope === 'full' && input.useCache !== false ? await this.store.cache(cacheKey) : undefined;
    let remote: SourceResult[] = cached?.results ?? [];
    if (!cached && normalized.scope === 'full') {
      const jobs: SearchJob[] = [];
      const cppCatalogs = { conan: cppCatalogSearch(this.http, 'conan', signal), vcpkg: cppCatalogSearch(this.http, 'vcpkg', signal) };
      let pubCorpus: Promise<PubCatalog & { cached: boolean }> | undefined;
      const pubCatalog = () => pubCorpus ??= (async () => {
        const entry = await this.store.read<PubCatalog>('cache', 'pub-names-v1');
        const age = entry ? Date.now() - Date.parse(entry.createdAt) : NaN;
        // Respect the official name-completion API's minimum eight-hour cache,
        // even when callers disable the separate six-hour query-result cache.
        if (entry && age >= 0 && age < 8 * 60 * 60 * 1000 && Array.isArray(entry.names) && entry.names.length <= 100000 && entry.names.every(n => typeof n === 'string' && /^[a-z_][a-z0-9_]*$/.test(n))) return { ...entry, cached: true };
        const fresh = await readPubCatalog(this.http, signal);
        await this.store.write('cache', 'pub-names-v1', fresh);
        return { ...fresh, cached: false };
      })().catch(error => { pubCorpus = undefined; throw error; });
      for (const q of queryPlan.executed) {
        const scopedNpm = !input.sources && /^@[\w.-]+\/[\w.-]+$/.test(q);
        for (const source of selection) {
          if (source === 'pypi' || source === 'goproxy') continue;
          if (scopedNpm && source !== 'npm') {
            jobs.push(async () => ({ source, query: q, status: 'skipped', candidates: [], elapsedMs: 0, notes: ['Exact scoped npm query routed to npm only.'] }));
          } else if (source === 'github') jobs.push(page => searchGitHub(this.http, q, signal, page));
          else if (source === 'gitlab') jobs.push((page, continuation) => searchGitLab(this.http, q, signal, page, continuation));
          else if (source === 'npm') jobs.push(page => searchNpm(this.http, q, signal, page));
          else if (source === 'pub') jobs.push(page => searchPub(q, signal, page, pubCatalog));
          else if (source === 'conan' || source === 'vcpkg') jobs.push(page => cppCatalogs[source](q, page));
          else {
            const state: RegistrySearchState = {};
            jobs.push((page, _continuation, attempt) => searchRegistry(this.http, source, q, signal, page, attempt, state));
          }
        }
      }
      for (const name of normalized.packageNames ?? []) jobs.push(() => verifyPypi(this.http, name, signal));
      for (const module of normalized.goModules ?? []) jobs.push(() => verifyGoModule(this.http, module, signal));
      remote = await searchPages(jobs, normalized.maxPages!, signal, normalized.maxRetries!);
      if (selection.includes('pypi') && !normalized.packageNames?.length) remote.push({ source: 'pypi', query: '', status: 'skipped', candidates: [], elapsedMs: 0, notes: ['Discover Python projects via repository search; inspect installation/project metadata to identify a distribution, then verify it with PyPI. PyPI full-text search is not available.'] });
      if (selection.includes('goproxy') && !normalized.goModules?.length) remote.push({ source: 'goproxy', query: '', status: 'skipped', candidates: [], elapsedMs: 0, notes: ['The Go proxy verifies only known public modules. Supply goModules from project/installation evidence; queries are not module paths and no Go module full-text search is available.'] });
      if (remote.every(r => ['ok', 'empty', 'skipped'].includes(r.status))) await this.store.saveCache(cacheKey, remote);
    }
    const local = await localPromise;
    const sources = [local, ...remote];
    const report: CheckReport = {
      id: randomUUID(), createdAt: new Date().toISOString(), projectRoot: root, contextHash, input: normalized, queryPlan: queryPlan.plan,
      coverage: sources.some(r => !['ok', 'empty', 'skipped'].includes(r.status)) ? 'partial' : 'complete',
      cached: Boolean(cached), cacheCreatedAt: cached?.createdAt, elapsedMs: Math.round(performance.now() - start),
      sources, candidates: mergeCandidates(sources.flatMap(r => r.candidates), queryPlan.executed), inspections: [],
      sourcePlan: SOURCE_CATALOG.map(s => ({ ...s, selected: normalized.sources!.includes(s.source) })),
      notes: ['Complete means the bounded query plan finished, not exhaustive ecosystem or all-platform coverage.', `Searches fetch at most ${normalized.maxPages} pages per source/query, sharing the total budget; all first-page jobs run before continuations. Pagination exposes remaining results and stop reasons. Full pages without a reported total may have more results; totals and offset rankings can change between requests.`, 'At most 8 local matches appear in the merged shortlist; source results retain additional matches. Each returning remote source keeps a representative when possible.', 'Exact scoped npm names are routed to npm unless explicit sources override routing.', 'Go uses repository search and explicit public module lookups; no Go registry full-text adapter is implemented.', 'Host must inspect relevant evidence and judge requirement fit; health signals do not authorize adoption.', ...(normalized.queries.some(q => /\p{Script=Han}/u.test(q)) ? ['Chinese queries are preserved. Add English technical synonyms when useful; this tool does not translate or invent them.'] : [])],
    };
    report.notes.push(`Transient failed pages allow ${normalized.maxRetries} source-level retries under the original total budget, after each page round's initial attempts and before continuations. Network errors, request timeouts and HTTP 408/5xx are eligible while budget remains; server-requested delays, authentication, throttling and invalid responses are not retried here. Existing short HTTP throttle handling is separate. Source failure history remains visible after recovery and in cached reports.`);
    if (normalized.alignment) report.alignmentPrompt = alignmentPrompt(report);
    report.notes.push(`Query plan executes ${queryPlan.executed.length} unique strings: original queries first, then explicit host-supplied variants, sharing the same total budget. The core does not translate or infer variants. Query provenance is public; local lexical token and result limits still apply. Remote shortlist slots favor the least represented available source, with fixed source-order ties and lexical ranking within each source; merged identities credit all their sources.`);
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
      inspection.analysis = await analyzeCode(inspection);
      check.inspections.push(inspection);
      await this.store.saveCheck(check);
      return inspection;
    } finally { release(); }
  }

  async assess(input: AlignmentInput): Promise<AlignmentReport> {
    // Share the inspection queue: appending assessments must not lose new evidence.
    const previous = this.inspectionQueue;
    let release!: () => void;
    this.inspectionQueue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try {
      const check = await this.store.check(input.checkId);
      if (!check) throw new Error('Unknown check');
      const report = assessAlignment(check, input);
      check.alignments ??= [];
      if (check.alignments.length >= 30) throw new Error('Alignment report budget reached; start a fresh check');
      check.alignments.push(report);
      await this.store.saveCheck(check);
      return report;
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
      if (check.input.alignment && previous.alignmentId !== input.alignmentId) throw new Error('Keep the planned alignment report throughout this decision chain');
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
        if (!relevant.some(i => i.metadata.license && i.files.some(f => isCodePath(f.path)))) throw new Error('Code adaptation requires code-file evidence and an identified license');
      }
    }
    if (input.status === 'verified' && (!input.validation || input.validation.trim().length < 12)) throw new Error('Verified decisions require a host-reported validation command and outcome');
    await validateAlignmentDecision(this.projectRoot, check, input);
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

// GitHub metadata normalization adapts wheel-hub; npm mapping adapts
// reuse-before-generate. Structured per-source outcomes adapt scout-mcp.
// Copyright notices and fixed revisions: THIRD_PARTY_NOTICES.md.
import { Http, SourceError, abortable } from './http.js';
import { queryTokens } from './project.js';
import type { Candidate, Source, SourceResult } from './types.js';

export function githubRepo(value?: string): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/^git\+/, '').replace(/^git@github\.com:/, 'https://github.com/');
  try {
    const url = new URL(cleaned);
    if (url.hostname.toLowerCase() !== 'github.com' || url.username || url.password) return undefined;
    const match = url.pathname.match(/^\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
    return match ? `${match[1]}/${match[2]}` : undefined;
  } catch { return undefined; }
}

export function gitlabRepo(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.replace(/^git\+/, '').replace(/^git@gitlab\.com:/, 'https://gitlab.com/'));
    if (url.hostname !== 'gitlab.com' || url.username || url.password || !['https:', 'http:', 'ssh:'].includes(url.protocol) || url.port) return undefined;
    const name = url.pathname.replace(/^\//, '').replace(/\.git\/?$/, '').replace(/\/$/, '');
    return /^[\w.-]+(?:\/[\w.-]+)+$/.test(name) && !name.split('/').some(p => p === '.' || p === '..' || p === '-') ? name : undefined;
  } catch { return undefined; }
}

export function repositoryKey(value?: string): string | undefined {
  const github = githubRepo(value);
  if (github) return `github:${github.toLowerCase()}`;
  const gitlab = gitlabRepo(value);
  return gitlab ? `gitlab:${gitlab}` : undefined;
}

export async function outcome(source: Source, query: string, signal: AbortSignal,
  operation: () => Promise<{ candidates: Candidate[]; partial?: boolean; notes?: string[]; effectiveQuery?: string }>): Promise<SourceResult> {
  const start = performance.now();
  try {
    if (signal.aborted) throw new SourceError('timeout', 'Request budget exhausted before this source could start');
    const result = await abortable(operation(), signal);
    return { source, query, effectiveQuery: result.effectiveQuery, status: result.partial ? 'partial' : result.candidates.length ? 'ok' : 'empty', candidates: result.candidates, notes: result.notes ?? [], elapsedMs: Math.round(performance.now() - start) };
  } catch (error) {
    const e = error instanceof SourceError ? error : new SourceError('unavailable', 'Source did not complete');
    return { source, query, status: e.code === 'rate_limited' ? 'rate_limited' : e.code === 'timeout' ? 'timeout' : 'unavailable', candidates: [], elapsedMs: Math.round(performance.now() - start), error: { code: e.code, message: e.message, status: e.status, retryAfterMs: e.retryAfterMs }, notes: [] };
  }
}

function boundedQuery(query: string, maximum: number): string {
  const text = query.trim();
  if (text.length <= maximum) return text;
  let prefix = '';
  for (const character of text) {
    if (prefix.length + character.length > maximum) break;
    prefix += character;
  }
  const word = prefix.lastIndexOf(' ');
  return (word > maximum / 2 ? prefix.slice(0, word) : prefix).trim();
}

export function searchGitHub(http: Http, query: string, signal: AbortSignal): Promise<SourceResult> {
  return outcome('github', query, signal, async () => {
    const suffix = /\bin:/.test(query) ? '' : ' in:name,description,readme';
    const effective = boundedQuery(query, 256 - suffix.length);
    const shortened = effective !== query.trim();
    const q = `${effective}${suffix}`;
    const url = new URL('https://api.github.com/search/repositories');
    url.searchParams.set('q', q);
    url.searchParams.set('per_page', '6');
    const data = await http.json(url.href, signal);
    if (!Array.isArray(data.items)) throw new SourceError('invalid_response', 'GitHub search response has no items');
    return {
      partial: Boolean(data.incomplete_results) || shortened,
      effectiveQuery: q,
      candidates: data.items.map((r: any): Candidate => ({
        id: `github:${r.full_name}`, source: 'github', name: r.full_name,
        url: `https://github.com/${r.full_name}`, repository: `https://github.com/${r.full_name}`,
        description: r.description ?? '', stars: r.stargazers_count, archived: r.archived,
        updatedAt: r.pushed_at, license: r.license?.spdx_id === 'NOASSERTION' ? undefined : r.license?.spdx_id,
        matchedQueries: [query], signals: repoSignals(r),
      })),
      notes: ['Repository/README discovery, not global source-code full-text search.', ...(shortened ? ['Query shortened to fit the 256-character GitHub limit; refine omitted terms before concluding.'] : []), ...(data.incomplete_results ? ['GitHub marked this result incomplete.'] : [])],
    };
  });
}

export function searchGitLab(http: Http, query: string, signal: AbortSignal): Promise<SourceResult> {
  return outcome('gitlab', query, signal, async () => {
    const exact = gitlabRepo(query);
    const url = new URL('https://gitlab.com/api/v4/projects');
    if (exact) url.pathname += `/${encodeURIComponent(exact)}`;
    else {
      url.searchParams.set('search', query);
      url.searchParams.set('visibility', 'public');
      url.searchParams.set('per_page', '6');
    }
    const data = await http.json(url.href, signal);
    const projects = exact ? data.visibility === 'public' ? [data] : [] : data;
    if (!Array.isArray(projects) || projects.some(p => typeof p.path_with_namespace !== 'string' || !gitlabRepo(p.web_url))) throw new SourceError('invalid_response', 'Invalid GitLab project search response');
    return { effectiveQuery: query, candidates: projects.slice(0, 6).map((p: any): Candidate => ({
      id: `gitlab:${p.path_with_namespace}`, source: 'gitlab', name: p.path_with_namespace,
      url: p.web_url, repository: p.web_url, description: p.description ?? '',
      stars: p.star_count, archived: p.archived, updatedAt: p.last_activity_at, matchedQueries: [query],
    })), notes: [exact ? 'Exact public gitlab.com project lookup; non-public project metadata is excluded.' : 'Public gitlab.com project name/path/description substring search only; first 6 newest projects, not global code search or self-hosted GitLab coverage.'] };
  });
}

export function repoSignals(repo: any, now = Date.now()): string[] {
  // Adapted from wheel-hub scorePopularity: log scale is a descriptive signal,
  // never an adopt verdict or a relevance score.
  const popularity = Math.max(0, Math.min(100, Math.log10((repo.stargazers_count ?? 0) + 1) / Math.log10(500_000) * 100));
  const days = repo.pushed_at ? Math.max(0, Math.round((now - Date.parse(repo.pushed_at)) / 86_400_000)) : undefined;
  return [
    `Popularity signal ${Math.round(popularity)}/100; not requirement fit`,
    ...(days !== undefined ? [`Last push ${days} days ago`] : []),
    ...(repo.archived ? ['Archived upstream'] : []),
  ];
}

export function searchNpm(http: Http, query: string, signal: AbortSignal): Promise<SourceResult> {
  return outcome('npm', query, signal, async () => {
    const effective = boundedQuery(query, 64);
    if (effective.length < 2) throw new SourceError('invalid_query', 'npm search requires at least two characters; supply a more specific query');
    const shortened = effective !== query.trim();
    const url = new URL('https://registry.npmjs.org/-/v1/search');
    url.searchParams.set('text', effective);
    url.searchParams.set('size', '6');
    const data = await http.json(url.href, signal);
    if (!Array.isArray(data.objects)) throw new SourceError('invalid_response', 'npm search response has no objects');
    return { partial: shortened, effectiveQuery: effective, candidates: data.objects.map(({ package: p }: any): Candidate => ({
      id: `npm:${p.name}`, source: 'npm', name: p.name, url: `https://www.npmjs.com/package/${p.name}`,
      description: p.description ?? '', version: p.version, repository: p.links?.repository,
      updatedAt: p.date, matchedQueries: [query],
      packages: [{ source: 'npm', name: p.name, version: p.version, url: `https://www.npmjs.com/package/${p.name}` }],
    })), notes: ['Package registry search; published metadata must be verified before adoption.', ...(shortened ? ['Query shortened to fit the 64-character npm limit; coverage is partial.'] : [])] };
  });
}

export function verifyPypi(http: Http, name: string, signal: AbortSignal): Promise<SourceResult> {
  return outcome('pypi', name, signal, async () => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(name)) throw new SourceError('invalid_name', 'Expected a PyPI distribution name');
    let data;
    try { data = await http.json(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, signal); }
    catch (error) {
      if (error instanceof SourceError && error.code === 'not_found') return { candidates: [], notes: ['This exact distribution name was not found. This is not evidence that no suitable Python package exists.'] };
      throw error;
    }
    const p = data.info;
    if (!p?.name || !p.version) throw new SourceError('invalid_response', 'PyPI response has no distribution metadata');
    const urls = Object.values(p.project_urls ?? {}) as string[];
    const repository = urls.find(u => repositoryKey(u));
    return { candidates: [{ id: `pypi:${p.name}`, source: 'pypi', name: p.name,
      url: `https://pypi.org/project/${p.name}/`, description: p.summary ?? '', version: p.version,
      repository, license: p.license_expression || p.license || undefined,
      matchedQueries: [name], packages: [{ source: 'pypi', name: p.name, version: p.version, url: `https://pypi.org/project/${p.name}/` }],
    }], notes: ['Known-name verification only; this is not PyPI full-text search.'] };
  });
}

export function mergeCandidates(candidates: Candidate[], queries: string[]): Candidate[] {
  const merged = new Map<string, Candidate>();
  for (const c of candidates) {
    const repo = repositoryKey(c.repository);
    const key = c.source === 'local' ? c.id : repo ? `repo:${repo}` : c.id;
    const existing = merged.get(key);
    if (existing) {
      existing.aliases = [...new Set([...(existing.aliases ?? []), c.id])];
      existing.sources = [...new Set([...(existing.sources ?? [existing.source]), c.source])];
      existing.matchedQueries = [...new Set([...(existing.matchedQueries ?? []), ...(c.matchedQueries ?? [])])];
      existing.packages = [...new Map([...(existing.packages ?? []), ...(c.packages ?? [])].map(p => [`${p.source}:${p.name}`, p])).values()];
      // A repository can publish multiple packages/versions. Keep versions on
      // packages instead of mislabeling the repository with one package version.
      if (existing.source !== 'github' && existing.source !== 'gitlab') existing.version ??= c.version;
      existing.license ??= c.license;
    } else merged.set(key, { ...c, aliases: [c.id], sources: [c.source] });
  }
  const tokens = queryTokens(queries);
  const score = (c: Candidate) => (c.source === 'local' ? 1000 : 0)
    + tokens.filter(t => `${c.name} ${c.description}`.toLowerCase().includes(t)).length * 10
    + (c.matchedQueries?.length ?? 0) - (c.archived ? 20 : 0);
  const sorted = [...merged.values()].sort((a, b) => score(b) - score(a));
  const local = sorted.filter(c => c.source === 'local').slice(0, 8);
  const remote = sorted.filter(c => c.source !== 'local');
  const representatives = new Set<Candidate>();
  for (const source of new Set(remote.flatMap(c => c.sources ?? [c.source]))) {
    const best = remote.find(c => (c.sources ?? [c.source]).includes(source));
    if (best) representatives.add(best);
  }
  return [...local, ...[...new Set([...representatives, ...remote])].slice(0, 30 - local.length)];
}

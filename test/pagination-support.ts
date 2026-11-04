import { json } from './support.js';
import type { RemoteSource } from '../src/types.js';

export const searchSource = (url: URL): RemoteSource => ({
  'api.github.com': 'github', 'gitlab.com': 'gitlab', 'registry.npmjs.org': 'npm',
  'crates.io': 'crates', 'search.maven.org': 'maven', 'azuresearch-usnc.nuget.org': 'nuget',
  'rubygems.org': 'rubygems', 'packagist.org': 'packagist',
  'hex.pm': 'hex',
}[url.hostname] as RemoteSource);

export function searchPage(url: URL): number {
  const offset = url.searchParams.get('from') ?? url.searchParams.get('start') ?? url.searchParams.get('skip');
  return offset === null ? Number(url.searchParams.get('page') ?? 1) : Number(offset) / 6 + 1;
}

export function pagedResponse(url: URL, overridePage?: number): Response {
  if (url.hostname === 'registry.npmjs.org' && url.pathname === '/result-6/1.0.0') return json({ name: 'result-6', version: '1.0.0', license: 'MIT', description: 'second_page_target' });
  if (url.hostname === 'api.nuget.org') return json({ resources: [{ '@type': 'SearchQueryService', '@id': 'https://azuresearch-usnc.nuget.org/query' }] });
  const source = searchSource(url);
  const page = overridePage ?? searchPage(url);
  const size = source === 'rubygems' ? 30 : 6;
  const total = size * 2 + 1;
  const rows = Array.from({ length: Math.max(0, Math.min(size, total - (page - 1) * size)) }, (_, i) => {
    const index = (page - 1) * size + i;
    const name = `result-${index}`;
    return { name, description: index === size ? 'second_page_target' : 'library', version: '1.0.0' };
  });
  if (source === 'github') return json({ total_count: total, incomplete_results: false, items: rows.map(p => ({ ...p, full_name: `example/${p.name}` })) });
  if (source === 'gitlab') return json(rows.map(p => ({ ...p, path_with_namespace: `example/${p.name}`, web_url: `https://gitlab.com/example/${p.name}`, visibility: 'public' })));
  if (source === 'npm') return json({ total, objects: rows.map(p => ({ package: p })) });
  if (source === 'crates') return json({ crates: rows.map(p => ({ ...p, max_stable_version: p.version })), meta: { total } });
  if (source === 'maven') return json({ response: { numFound: total, docs: rows.map(p => ({ g: 'org.example', a: p.name, latestVersion: p.version })) } });
  if (source === 'nuget') return json({ totalHits: total, data: rows.map(p => ({ ...p, id: p.name })) });
  if (source === 'rubygems') return json(rows.map(p => ({ ...p, info: p.description, platform: 'ruby' })));
  if (source === 'packagist') return json({ total, results: rows.map(p => ({ ...p, name: `example/${p.name}` })), next: `https://packagist.org/search.json?page=${page + 1}` });
  if (source === 'hex') return json(rows.map(p => ({ name: p.name.replace('-', '_'), latest_stable_version: p.version, meta: { description: p.description } })));
  throw new Error(`Unexpected pagination fixture URL ${url.href}`);
}

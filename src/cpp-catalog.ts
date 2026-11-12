import { readConanCatalog } from './conan-catalog.js';
import { CatalogGit, type CatalogSnapshot, type CppSource } from './cpp-git.js';
import type { Http } from './http.js';
import { registryCandidate } from './packages.js';
import { pageProgress } from './pagination.js';
import { outcome } from './sources.js';
import { readVcpkgCatalog } from './vcpkg-catalog.js';

export function cppCatalogSearch(http: Http, source: CppSource, signal: AbortSignal) {
  const git = new CatalogGit(source, http, signal);
  let snapshot: Promise<CatalogSnapshot> | undefined;
  const read = source === 'conan' ? readConanCatalog : readVcpkgCatalog;
  const load = () => snapshot ??= read(git).then(result => {
    result.entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    return result;
  }).catch(error => { snapshot = undefined; throw error; });

  return (query: string, page: number) => outcome(source, query, signal, async () => {
    const catalog = await load();
    const effectiveQuery = query.toLowerCase();
    const matches = catalog.entries.filter(entry => entry.name.includes(effectiveQuery));
    const pageSize = 6;
    const candidates = matches.slice((page - 1) * pageSize, page * pageSize).map(entry => {
      const path = (source === 'conan' ? 'recipes/' : 'ports/') + entry.name;
      const url = 'https://github.com/' + git.repository + '/tree/' + catalog.revision + '/' + path;
      const description = source === 'conan' ? 'Recipe name in the pinned Conan Center Index.' : 'Port name and default baseline version in the pinned Microsoft vcpkg catalog.';
      const candidate = registryCandidate(source, query, entry.name, url, description, entry.version);
      const identity = candidate.packages![0]!;
      identity.catalogRevision = catalog.revision;
      if (entry.tree) identity.catalogTree = entry.tree;
      return candidate;
    });
    return {
      effectiveQuery,
      endpoint: catalog.endpoint,
      catalogRevision: catalog.revision,
      candidates,
      partial: catalog.partial,
      pagination: { ...pageProgress(page, pageSize, candidates.length, matches.length), mode: 'local' },
      notes: [
        ...catalog.notes,
        'Literal name substring matches only; local pages and totals refer to the returned catalog snapshot.',
      ],
    };
  }, () => 'https://api.github.com/repos/' + git.repository + '/commits/HEAD');
}

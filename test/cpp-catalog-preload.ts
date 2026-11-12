import { conanCatalogResponse } from './conan-catalog-support.js';
import { fakeFetch, json } from './support.js';
import { vcpkgCatalogResponse } from './vcpkg-catalog-support.js';

globalThis.fetch = fakeFetch(url => {
  const catalog = conanCatalogResponse(url) ?? vcpkgCatalogResponse(url);
  if (catalog) return catalog;
  if (url.hostname === 'api.github.com' && url.pathname === '/search/repositories') return json({ items: [] });
  if (url.hostname === 'gitlab.com' && url.pathname === '/api/v4/projects') return json([]);
  throw new Error('Unexpected C/C++ catalog fixture endpoint ' + url.href);
});

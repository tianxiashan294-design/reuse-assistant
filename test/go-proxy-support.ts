import { json } from './support.js';

export const goProxy = 'https://proxy.golang.org';
export const modulePath = 'example.com/Team/queue/v2';
export const proxyPath = '/example.com/!team/queue/v2';
export const latestVersion = 'v2.1.0-Preview.2';
export const latestInfoPath = proxyPath + '/@v/v2.1.0-!preview.2.info';
export const latestModPath = proxyPath + '/@v/v2.1.0-!preview.2.mod';
export const olderVersion = 'v2.0.0';
export const olderInfoPath = proxyPath + '/@v/v2.0.0.info';
export const latestInfo = '{"Version":"v2.1.0-Preview.2","Time":"2025-01-01T01:02:03Z","Origin":{"URL":"https://github.com/untrusted/repo","Hash":"' + 'a'.repeat(40) + '"}}\n';
export const latestMod = '// proxy module fixture\n\nmodule "example.com/Team/queue/v2" // quoted module path\n\ngo 1.23\n';

export function goProxyResponse(url: URL): Response {
  if (url.hostname === 'api.github.com' && url.pathname === '/search/repositories') return json({ items: [] });
  if (url.hostname === 'gitlab.com' && url.pathname === '/api/v4/projects') return json([]);
  if (url.origin !== goProxy || url.search || url.hash) throw new Error('Unexpected Go proxy fixture URL ' + url.href);
  switch (url.pathname) {
    case proxyPath + '/@latest': return json({ Version: latestVersion });
    case latestInfoPath: return new Response(latestInfo);
    case latestModPath: return new Response(latestMod);
    case olderInfoPath: return json({ Version: olderVersion });
    case proxyPath + '/@v/v2.0.0.mod': return new Response('module ' + modulePath + '\n');
    case '/gopkg.in/yaml.v3/@v/v3.0.1.info': return json({ Version: 'v3.0.1' });
    case '/gopkg.in/yaml.v3/@v/v3.0.1.mod': return new Response('module "gopkg.in/yaml.v3"\n');
    case '/example.org/legacy/@v/v3.2.1%2Bincompatible.info': return json({ Version: 'v3.2.1+incompatible' });
    case '/example.org/pseudo/@v/v0.0.0-20250101000000-aaaaaaaaaaaa.info': return json({ Version: 'v0.0.0-20250101000000-aaaaaaaaaaaa' });
    default: throw new Error('Unexpected Go proxy fixture URL ' + url.href);
  }
}

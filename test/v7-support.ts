import { fakeFetch, json } from './support.js';

export function v7Response(url: URL): Response {
  if (url.hostname === 'pub.dev') {
    if (url.pathname === '/api/package-name-completion-data') return json({ packages: [...Array.from({ length: 13 }, (_, i) => `json_${i}`), '_flutterfire_internals'] });
    if (/^\/api\/packages\/json_\d+$/.test(url.pathname)) return json({ name: url.pathname.split('/').at(-1), latest: { version: '1.2.3' } });
    const name = url.pathname.split('/')[3];
    return json({ version: '1.2.3', pubspec: { name, version: '1.2.3', description: 'JSON package' }, archive_sha256: 'a'.repeat(64), archive_url: 'https://untrusted.invalid/never-fetch' });
  }
  if (url.hostname === 'hex.pm') {
    if (url.pathname === '/api/packages') {
      const page = Number(url.searchParams.get('page') ?? 1);
      return json(Array.from({ length: Math.min(6, Math.max(0, 13 - (page - 1) * 6)) }, (_, i) => ({ name: `json_${(page - 1) * 6 + i}`, latest_stable_version: '1.2.3', meta: { description: 'JSON package' } })));
    }
    if (/\/releases\//.test(url.pathname)) return json({ version: '1.2.3', url: url.href, checksum: 'b'.repeat(64) });
    return json({ name: url.pathname.split('/').at(-1), latest_stable_version: '9.0.0', meta: { description: 'JSON package', licenses: ['Apache-2.0'], links: {} } });
  }
  throw new Error(`Unexpected v7 URL: ${url.href}`);
}
export const v7Fetch = () => fakeFetch(v7Response);

import { fakeFetch, json, SHA } from './support.js';

export const GL = 'group/subgroup/scheduler';
export function v2Response(url: URL): Response {
  const host = url.hostname;
  const p = decodeURIComponent(url.pathname);
  if (host === 'api.github.com' && p === '/search/repositories') return json({ items: [], incomplete_results: false });
  if (host === 'registry.npmjs.org') return json({ objects: [] });
  if (host === 'pypi.org') return json({ info: { name: 'APScheduler', version: '3.0.0', summary: 'scheduler' } });
  if (host === 'gitlab.com') {
    if (p === '/api/v4/projects') return json([{ path_with_namespace: GL, web_url: `https://gitlab.com/${GL}`, description: 'scheduler', star_count: 0 }]);
    const base = `/api/v4/projects/${GL}`;
    if (p === base) return json({ default_branch: 'main', archived: false, license: { key: 'MIT' } });
    if (p.startsWith(`${base}/repository/commits/`)) return json({ id: SHA });
    if (p === `${base}/repository/tree`) return json(url.searchParams.has('path') ? [{ path: 'src/job.zig', type: 'blob' }] : [{ path: 'README.md', type: 'blob' }, { path: 'LICENSE', type: 'blob' }, { path: 'Cargo.toml', type: 'blob' }]);
    const name = p.split('/repository/files/')[1];
    const files: Record<string, string> = { 'README.md': '# Scheduler', LICENSE: 'MIT License\nCopyright example', 'Cargo.toml': '[package]\nname="scheduler"', 'src/job.zig': 'line 1\nline 2\nline 3\nline 4' };
    if (name && files[name]) return json({ file_path: name, encoding: 'base64', content: Buffer.from(files[name]).toString('base64'), commit_id: SHA });
    if (name) return json({}, 404);
  }
  if (host === 'crates.io') {
    if (p === '/api/v1/crates') return json({ crates: [{ name: 'scheduler', max_stable_version: '1.2.3', repository: `https://gitlab.com/${GL}`, description: 'scheduler' }] });
    if (p === '/api/v1/crates/scheduler/1.2.3') return json({ version: { crate: 'scheduler', num: '1.2.3', license: 'MIT', repository: `https://gitlab.com/${GL}` } });
  }
  if (host === 'search.maven.org') return json({ response: { docs: [{ g: 'org.example', a: 'scheduler', latestVersion: '2.0.0', p: 'jar' }] } });
  if (host === 'repo.maven.apache.org') return new Response('<project><groupId>org.example</groupId><artifactId>scheduler</artifactId><version>2.0.0</version><licenses><license><name>Apache-2.0</name></license></licenses></project>');
  if (host === 'api.nuget.org') {
    if (p === '/v3/index.json') return json({ resources: [{ '@id': 'https://azuresearch-usnc.nuget.org/query', '@type': 'SearchQueryService' }] });
    if (p === '/registration/scheduler/index.json') return json({ items: [{ items: [{ catalogEntry: { id: 'Scheduler', version: '3.0.0', licenseExpression: 'MIT', description: 'scheduler' } }] }] });
    if (p === '/leaf/scheduler/3.0.0.json') return json({ catalogEntry: 'https://api.nuget.org/catalog/scheduler.3.0.0.json' });
    if (p === '/catalog/scheduler.3.0.0.json') return json({ id: 'Scheduler', version: '3.0.0', licenseExpression: 'MIT', description: 'scheduler' });
  }
  if (host === 'azuresearch-usnc.nuget.org') return json({ data: [{ id: 'Scheduler', version: '3.0.0', description: 'scheduler', registration: 'https://api.nuget.org/registration/scheduler/index.json', versions: [{ version: '3.0.0', '@id': 'https://api.nuget.org/leaf/scheduler/3.0.0.json' }] }] });
  if (host === 'rubygems.org') {
    const gem = { name: 'scheduler', version: '4.0.0', platform: 'ruby', info: 'scheduler', licenses: ['MIT'] };
    return json(p === '/api/v1/search.json' ? [gem] : gem);
  }
  if (host === 'packagist.org') {
    if (p === '/search.json') return json({ results: [{ name: 'example/scheduler', description: 'scheduler', repository: 'https://example.org/scheduler' }] });
    return json({ package: { name: 'example/scheduler', versions: {
      '2.0.0': { name: 'example/scheduler', version: '2.0.0', license: ['MIT'] },
      '10.0.0': { name: 'example/scheduler', version: '10.0.0', license: ['MIT'] },
      'dev-main': { name: 'example/scheduler', version: 'dev-main' },
    } } });
  }
  throw new Error(`Unexpected fixture URL ${url.href}`);
}
export const v2Fetch = () => fakeFetch(v2Response);

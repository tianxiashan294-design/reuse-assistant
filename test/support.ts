import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TestContext } from 'node:test';

export async function fixture(t: TestContext): Promise<string> {
  const parent = path.resolve('.reuse-assistant/test-runs');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'case-'));
  await writeFile(path.join(root, 'package.json'), '{"name":"fixture","version":"1.0.0"}\n');
  t.after(async () => {
    const relative = path.relative(parent, path.resolve(root));
    if (relative.startsWith('..') || path.isAbsolute(relative) || !relative) throw new Error('Unsafe fixture cleanup target');
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
}
export function fakeFetch(fn: (url: URL, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return (async (input: any, init?: RequestInit) => fn(new URL(String(input)), init)) as typeof fetch;
}
export const SHA = 'a'.repeat(40);
export const repo = { full_name: 'tiny/scheduler', description: 'background scheduler', html_url: 'https://github.com/tiny/scheduler', stargazers_count: 2, archived: false, pushed_at: '2026-10-01T00:00:00Z', license: { spdx_id: 'MIT' }, default_branch: 'main' };

export function githubEvidence(url: URL): Response | undefined {
  if (url.pathname === '/repos/tiny/scheduler') return json(repo);
  if (url.pathname.startsWith('/repos/tiny/scheduler/commits/')) return json({ sha: SHA });
  if (url.pathname === '/repos/tiny/scheduler/contents') return json([{ path: 'src', type: 'dir' }, { path: 'pyproject.toml', type: 'file' }]);
  const files: Record<string, [string, string]> = {
    '/repos/tiny/scheduler/readme': ['README.md', '# Scheduler\npip install tiny-scheduler\nPersistent background scheduler.'],
    '/repos/tiny/scheduler/license': ['LICENSE', 'MIT License\nCopyright (c) tiny contributors'],
    '/repos/tiny/scheduler/contents/pyproject.toml': ['pyproject.toml', '[project]\nname = "tiny-scheduler"\nversion = "1.0.0"'],
    '/repos/tiny/scheduler/contents/src/scheduler.py': ['src/scheduler.py', Array.from({ length: 40 }, (_, i) => `# code line ${i + 1}`).join('\n')],
  };
  const entry = files[url.pathname];
  if (entry) return json({ type: 'file', path: entry[0], encoding: 'base64', content: Buffer.from(entry[1]).toString('base64') });
  if (url.hostname === 'pypi.org' && url.pathname === '/pypi/tiny-scheduler/json') return json({ info: { name: 'tiny-scheduler', version: '1.2.0', summary: 'background scheduler', project_urls: { Source: 'https://github.com/tiny/scheduler' } } });
  return undefined;
}

import { createHash } from 'node:crypto';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Candidate, SourceResult } from './types.js';

export const digest = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const queryTokens = (queries: string[]) => [...new Set(queries.flatMap(q => q.toLowerCase().match(/\p{Script=Han}{2,}|[\p{L}\p{N}_-]{3,}/gu) ?? []))];
const SKIP = new Set(['.git', 'node_modules', '.reuse-assistant', '.codex', '.agents', 'dist', 'build', 'coverage', '.venv', 'venv', '__pycache__', 'vendor']);
const EXT = /\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|cs|rb|php|json|toml|yaml|yml|md)$/i;
const MANIFESTS = ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'pyproject.toml', 'requirements.txt', 'uv.lock', 'poetry.lock', 'Cargo.toml', 'go.mod'];

export async function confined(root: string, relative: string): Promise<string> {
  const base = await realpath(root);
  const target = await realpath(path.resolve(base, relative));
  const rel = path.relative(base, target);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('Path leaves the configured project');
  return target;
}

export async function projectFingerprint(root: string): Promise<string> {
  const manifests = await Promise.all(MANIFESTS.map(async name => {
    try { return [name, await readFile(await confined(root, name), 'utf8')]; }
    catch (error: any) { if (error.code === 'ENOENT') return [name, null]; throw error; }
  }));
  return digest(manifests);
}

export async function searchLocal(root: string, queries: string[], signal: AbortSignal): Promise<SourceResult> {
  const start = performance.now();
  const candidates: Candidate[] = [];
  let count = 0;
  let truncated = false;
  const tokens = queryTokens(queries).slice(0, 16);
  async function walk(dir: string): Promise<void> {
    if (signal.aborted || count >= 1200 || candidates.length >= 30) { truncated = true; return; }
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (signal.aborted || count >= 1200 || candidates.length >= 30) { truncated = true; return; }
      if (entry.isSymbolicLink() || SKIP.has(entry.name) || entry.name.startsWith('.env')) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (!entry.name.startsWith('.')) await walk(file); continue; }
      if (!entry.isFile() || !EXT.test(entry.name)) continue;
      count++;
      const info = await stat(file);
      if (info.size > 180_000) { truncated = true; continue; }
      const text = await readFile(await confined(root, path.relative(root, file)), 'utf8');
      if (text.includes('\0')) continue;
      const lower = text.toLowerCase();
      const matched = tokens.filter(t => lower.includes(t.toLowerCase()));
      if (!matched.length) continue;
      const lines = text.split(/\r?\n/);
      const line = lines.findIndex(l => matched.some(t => l.toLowerCase().includes(t.toLowerCase()))) + 1;
      const relative = path.relative(root, file).split(path.sep).join('/');
      candidates.push({ id: `local:${relative}`, source: 'local', name: relative, url: `local:${relative}`, description: (lines[line - 1] ?? '').slice(0, 240), localPath: relative, line, matchedQueries: matched, signals: [`${matched.length} lexical matches; inspect before deciding`] });
    }
  }
  try {
    await walk(root);
    return { source: 'local', query: queries.join(' | '), status: truncated ? 'partial' : candidates.length ? 'ok' : 'empty', candidates, elapsedMs: Math.round(performance.now() - start), notes: [`Scanned ${count} text files; lexical matches require host review.`, ...(truncated ? ['Local scan reached a budget or size limit.'] : [])] };
  } catch (error: any) {
    return { source: 'local', query: '', status: 'unavailable', candidates: [], elapsedMs: Math.round(performance.now() - start), error: { code: 'local_read', message: error.code ? `Project read failed (${error.code})` : 'Project read failed' }, notes: [] };
  }
}

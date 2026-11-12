import { createHash } from 'node:crypto';
import { Http, SourceError } from './http.js';

const repositories = { conan: 'conan-io/conan-center-index', vcpkg: 'microsoft/vcpkg' } as const;
export type CppSource = keyof typeof repositories;

export interface CatalogEntry { name: string; version?: string; tree?: string }
export interface CatalogSnapshot {
  revision: string;
  endpoint: string;
  entries: CatalogEntry[];
  partial: boolean;
  notes: string[];
}
export interface GitText { url: string; content: string }
export interface CatalogInspection {
  attempt<T>(label: string, work: () => Promise<T>): Promise<T | undefined>;
  add(path: string, file: GitText, ref: string): void;
  metadata: Record<string, unknown>;
  notes: string[];
}

interface GitEntry { path: string; sha: string; type: 'tree' | 'blob' | 'commit'; mode: string }
export const gitObjectId = (value: unknown): value is string => typeof value === 'string' && value.length === 40 && /^[a-f0-9]+$/.test(value);

function invalid(url: string, message: string): never {
  throw new SourceError('invalid_response', message, undefined, undefined, url);
}

function decodeGitText(data: any, sha: unknown, url: string, limit: number): GitText {
  if (!gitObjectId(sha) || data?.sha !== sha || data.encoding !== 'base64' || typeof data.content !== 'string' || !Number.isSafeInteger(data.size) || data.size < 0) invalid(url, 'Invalid GitHub text object identity or encoding');
  if (data.size > limit) throw new SourceError('too_large', 'GitHub text object exceeds the byte limit', undefined, undefined, url);
  const base64 = data.content.replace(/[\r\n]/g, '');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length !== data.size || bytes.toString('base64') !== base64) invalid(url, 'Invalid GitHub base64 or byte length');
  const actual = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
  if (sha !== actual) invalid(url, 'GitHub text object hash does not match');
  if (bytes.includes(0)) invalid(url, 'GitHub text object contains a NUL byte');
  try { return { url, content: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) }; }
  catch { return invalid(url, 'GitHub text object is not UTF-8'); }
}

export class CatalogGit {
  readonly repository: string;
  private readonly api: string;

  constructor(source: CppSource, private readonly http: Http, private readonly signal: AbortSignal) {
    this.repository = repositories[source];
    this.api = 'https://api.github.com/repos/' + this.repository;
  }

  async head() {
    const endpoint = this.api + '/commits/HEAD';
    const data = await this.http.json(endpoint, this.signal, 2_000_000);
    if (!gitObjectId(data?.sha) || !gitObjectId(data.commit?.tree?.sha)) invalid(endpoint, 'Invalid GitHub catalog commit or root tree');
    return { revision: data.sha, tree: data.commit.tree.sha as string, endpoint };
  }

  async tree(sha: string): Promise<{ entries: GitEntry[]; truncated: boolean; url: string }> {
    if (!gitObjectId(sha)) throw new SourceError('invalid_response', 'Invalid GitHub catalog tree ID');
    const url = this.api + '/git/trees/' + sha;
    const data = await this.http.json(url, this.signal, 2_000_000);
    if (data?.sha !== sha || !Array.isArray(data.tree) || typeof data.truncated !== 'boolean') invalid(url, 'Invalid GitHub catalog tree identity or entries');
    if (data.tree.length > 10_000) throw new SourceError('too_large', 'GitHub catalog tree exceeds the entry limit', undefined, undefined, url);
    const seen = new Set<string>();
    for (const item of data.tree) {
      if (typeof item?.path !== 'string' || !item.path || item.path === '.' || item.path === '..' || /[/\\\x00-\x1f\x7f]/.test(item.path) || seen.has(item.path) || !gitObjectId(item.sha)) invalid(url, 'Invalid or duplicate GitHub catalog tree entry');
      const mode = item.type === 'tree' ? /^040000$/ : item.type === 'blob' ? /^(?:100644|100755|120000)$/ : item.type === 'commit' ? /^160000$/ : undefined;
      if (typeof item.mode !== 'string' || !mode?.test(item.mode)) invalid(url, 'Invalid GitHub catalog tree object type or mode');
      seen.add(item.path);
    }
    return { entries: data.tree, truncated: data.truncated, url };
  }

  async file(revision: string, path: string, limit = 180_000): Promise<GitText> {
    const parts = path.split('/');
    if (!gitObjectId(revision) || parts.some(part => !/^[a-zA-Z0-9_.-]+$/.test(part) || part === '.' || part === '..')) throw new SourceError('invalid_response', 'Invalid GitHub catalog file path or revision');
    const url = this.api + '/contents/' + parts.map(encodeURIComponent).join('/') + '?ref=' + revision;
    const data = await this.http.json(url, this.signal, limit * 2 + 4096);
    if (data?.path !== path || data.type !== 'file') invalid(url, 'GitHub catalog content does not match the requested file');
    return decodeGitText(data, data.sha, url, limit);
  }

  async blob(sha: string, limit = 180_000): Promise<GitText> {
    if (!gitObjectId(sha)) throw new SourceError('invalid_response', 'Invalid GitHub catalog blob ID');
    const url = this.api + '/git/blobs/' + sha;
    return decodeGitText(await this.http.json(url, this.signal, limit * 2 + 4096), sha, url, limit);
  }
}

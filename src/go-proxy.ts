import { Http, SourceError } from './http.js';
import { registryCandidate } from './packages.js';
import { outcome } from './sources.js';
import type { GoModuleLookup, SourceResult } from './types.js';

const proxy = 'https://proxy.golang.org';
const windowsName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function moduleMajor(path: string): string | undefined {
  if (typeof path !== 'string' || path.length > 300 || path !== path.trim()) return undefined;
  const parts = path.split('/');
  const host = parts[0]!;
  if (!/^[a-z0-9.][a-z0-9.-]*$/.test(host) || !host.includes('.')) return undefined;
  for (const part of parts) {
    if (!/^[A-Za-z0-9_~-][A-Za-z0-9._~-]*$/.test(part) || part.endsWith('.')) return undefined;
    const prefix = part.split('.')[0]!;
    if (windowsName.test(prefix) || /~[0-9]+$/.test(prefix)) return undefined;
  }
  const last = parts.at(-1)!;
  if (path.startsWith('gopkg.in/')) {
    return last.endsWith('.v0') ? '0' : last.match(/\.v([1-9][0-9]*)(?:-unstable)?$/)?.[1];
  }
  if (parts.length > 1 && /^v[0-9.]+$/.test(last)) return last.match(/^v([2-9]|[1-9][0-9]+)$/)?.[1];
  return '';
}

function validVersion(path: string, pathMajor: string, version: unknown): version is string {
  if (typeof version !== 'string' || version.length > 200 || version !== version.trim()) return false;
  const match = /^v(0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(\+incompatible)?$/.exec(version);
  if (!match || match[2]?.split('.').some(part => /^0[0-9]+$/.test(part))) return false;
  const major = match[1]!;
  if (!pathMajor) return major === '0' || major === '1' || Boolean(match[3]);
  // The proxy still serves early gopkg.in v1 pseudo-versions with a v0 prefix.
  return pathMajor === major || pathMajor === '1' && path.startsWith('gopkg.in/') && version.startsWith('v0.0.0-');
}

export function validateGoModules(entries: GoModuleLookup[] | undefined): void {
  if (entries === undefined) return;
  if (!Array.isArray(entries) || entries.length > 3) throw new Error('Provide up to three known public Go modules');
  for (const entry of entries) {
    const major = moduleMajor(entry?.path);
    if (major === undefined) throw new Error('Invalid Go module path; supply a known public module path');
    if (entry.version !== undefined && !validVersion(entry.path, major, entry.version)) throw new Error('Invalid Go module version; supply a canonical version matching the module path');
  }
}

function escaped(value: string): string {
  return encodeURIComponent(value.replace(/[A-Z]/g, letter => '!' + letter.toLowerCase()));
}

function moduleUrl(path: string): string {
  return `${proxy}/${path.split('/').map(escaped).join('/')}`;
}

async function readInfo(http: Http, path: string, url: string, signal: AbortSignal, expected?: string) {
  const content = await http.text(url, signal, 64_000);
  let info: { Version?: unknown } | null;
  try { info = JSON.parse(content); }
  catch { throw new SourceError('invalid_response', 'Go proxy returned invalid version JSON', undefined, undefined, url); }
  const major = moduleMajor(path);
  if (major === undefined || !validVersion(path, major, info?.Version) || (expected !== undefined && info.Version !== expected)) {
    throw new SourceError('invalid_response', 'Go proxy version disagrees with the selected module path or version', undefined, undefined, url);
  }
  return { url, content, version: info.Version };
}

export function readFixedGoInfo(http: Http, path: string, version: string, signal: AbortSignal) {
  validateGoModules([{ path, version }]);
  return readInfo(http, path, `${moduleUrl(path)}/@v/${escaped(version)}.info`, signal, version);
}

export async function readFixedGoMod(http: Http, path: string, version: string, signal: AbortSignal) {
  validateGoModules([{ path, version }]);
  const url = `${moduleUrl(path)}/@v/${escaped(version)}.mod`;
  const content = await http.text(url, signal, 180_000);
  const directives: string[] = [];
  let inBlock = false;
  for (const raw of content.split(/\r?\n/)) {
    // An allowed module path never contains //, even inside double quotes.
    const line = raw.split('//', 1)[0]!.replace(/^[\t ]+|[\t ]+$/g, '');
    if (inBlock) {
      if (line === ')') inBlock = false;
      continue;
    }
    if (/^module(?:[\t (]|$)/.test(line)) directives.push(line);
    if (/^[^\s()]+[\t ]*\($/.test(line)) inBlock = true;
  }
  const directive = directives.length === 1 ? /^module[\t ]+(?:"([^"\\]+)"|([^\s"`]+))$/.exec(directives[0]!) : null;
  if (!directive || (directive[1] ?? directive[2]) !== path) {
    throw new SourceError('invalid_response', 'Go proxy .mod module directive is missing, unsupported or disagrees with the selected module path', undefined, undefined, url);
  }
  return { url, content };
}

export function verifyGoModule(http: Http, lookup: GoModuleLookup, signal: AbortSignal): Promise<SourceResult> {
  const { path } = lookup;
  const base = moduleUrl(path);
  const query = lookup.version ? `${path}@${lookup.version}` : path;
  let endpoint = lookup.version ? `${base}/@v/${escaped(lookup.version)}.info` : `${base}/@latest`;
  return outcome('goproxy', query, signal, async () => {
    const version = lookup.version ?? (await readInfo(http, path, endpoint, signal)).version;
    endpoint = `${base}/@v/${escaped(version)}.info`;
    const fixed = await readInfo(http, path, endpoint, signal, version);
    const candidate = registryCandidate('goproxy', query, path, fixed.url, 'Version reported by the public Go module proxy; inspect go.mod to verify the declared module path.', version);
    candidate.id = `goproxy:${path}@${version}`;
    return {
      endpoint,
      candidates: [candidate],
      pagination: { mode: 'lookup', pageSize: 1, pagesFetched: 1, itemsFetched: 1, hasMore: false, stopReason: 'lookup' },
      notes: ['Known module/version lookup only; no Go module search. An omitted version uses the public proxy’s @latest locator and then the fixed .info endpoint. Module declaration identity is checked during inspection.'],
    };
  }, () => endpoint);
}

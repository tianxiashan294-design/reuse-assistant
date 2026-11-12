import { Http, SourceError } from './http.js';
import { digest } from './project.js';
import { outcome, repositoryKey } from './sources.js';
import { pageProgress } from './pagination.js';
import { registryCandidate as candidate } from './packages.js';
import { readPomIdentity } from './pom.js';
import type { PublishedPackage } from './registries.js';
import type { Candidate, PackageIdentity, SourceResult } from './types.js';

type AdditionalSource = 'clojars' | 'hackage' | 'metacpan';
interface HackageResults { names: string[]; saturated: boolean }
export interface AdditionalSearchState { hackageResults?: Promise<HackageResults> }
function bad(message: string): never { throw new SourceError('invalid_response', message); }
const string = (value: unknown): string | undefined => typeof value === 'string' && value.length > 0 ? value : undefined;
// Hackage accepts ASCII alphanumerics, with a letter in each hyphen-separated component.
const hackageName = (name: unknown): name is string => typeof name === 'string' && /^\d*[a-z][a-z0-9]*(?:-\d*[a-z][a-z0-9]*)*$/i.test(name);
const versionText = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? String(value) : string(value);
const repository = (value: unknown) => typeof value === 'string' && repositoryKey(value) ? value : undefined;

async function hackageResults(http: Http, query: string, signal: AbortSignal): Promise<HackageResults> {
  const url = new URL('https://hackage.haskell.org/packages/search');
  url.searchParams.set('terms', query);
  const data = await http.json(url.href, signal, 500_000);
  if (!Array.isArray(data)) bad('Hackage search did not return a name array');
  if (data.length > 800) throw new SourceError('too_large', 'Hackage search exceeds the supported 800-name upstream candidate-pool bound');
  if (data.some(row => !row || !hackageName(row.name))) bad('Hackage search contains invalid package names');
  return { names: [...new Set<string>(data.map(row => row.name))], saturated: data.length >= 400 };
}

export function searchAdditionalRegistry(http: Http, source: AdditionalSource, query: string, signal: AbortSignal, page = 1, state?: AdditionalSearchState): Promise<SourceResult> {
  let endpoint: string | undefined;
  return outcome(source, query, signal, async () => {
    if (source === 'hackage') {
      const target = new URL('https://hackage.haskell.org/packages/search'); target.searchParams.set('terms', query); endpoint = target.href;
      const { names, saturated } = await (state ? state.hackageResults ??= hackageResults(http, query, signal).catch(error => { state.hackageResults = undefined; throw error; }) : hackageResults(http, query, signal));
      const rows = names.slice((page - 1) * 6, page * 6);
      return { endpoint, partial: saturated, candidates: rows.map(name => candidate(source, query, name, `https://hackage.haskell.org/package/${name}`, 'Official bounded name/synopsis/description search match; version selected during inspection.')),
        pagination: { ...pageProgress(page, 6, rows.length, names.length), mode: 'local' as const },
        notes: ['Official metadata search returns a finite candidate pool (upstream soft/hard limits 400/800); local pages, totals and exhaustion refer only to this returned set, not every possible match.', ...(saturated ? ['The raw result count reached the upstream soft bound before deduplication; coverage remains partial.'] : []), 'One successful search load is shared across this query\'s pages; failed loads may be retried. No source archive is read.'] };
    }
    if (source === 'clojars') {
      const url = new URL('https://clojars.org/search'); url.search = new URLSearchParams({ q: query, format: 'json', page: String(page) }).toString(); endpoint = url.href;
      const data = await http.json(url.href, signal);
      if (!Array.isArray(data.results) || data['results-per-page'] !== 24 || data.offset !== (page - 1) * 24 || data.count !== data.results.length || !Number.isSafeInteger(data['total-hits']) || data['total-hits'] < 0) bad('Invalid Clojars search progress/results');
      const candidates = data.results.map((row: any): Candidate => {
        if (!row || !string(row.group_name) || !string(row.jar_name) || !/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(row.group_name) || row.group_name.split('.').some((part: string) => !part) || !/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(row.jar_name) || !string(row.version)) bad('Invalid Clojars package coordinates');
        return candidate(source, query, `${row.group_name}/${row.jar_name}`, `https://clojars.org/${encodeURIComponent(row.group_name)}/${encodeURIComponent(row.jar_name)}`, row.description, row.version);
      });
      return { endpoint, candidates, pagination: pageProgress(page, 24, candidates.length, data['total-hits']), notes: ['Official Clojars package metadata search uses fixed upstream pages of 24. Non-SNAPSHOT fixed POM evidence is available; timestamped SNAPSHOT resolution, inherited/interpolated coordinates and package archives are not read.'] };
    }
    const escaped = query.replace(/([+\-!(){}\[\]^"~*?:\\/]|&&|\|\|)/g, '\\$&');
    const effectiveQuery = `status:latest AND authorized:true AND maturity:released AND (${escaped})`;
    const url = new URL('https://fastapi.metacpan.org/v1/release/_search'); url.search = new URLSearchParams({ q: effectiveQuery, size: '6', from: String((page - 1) * 6) }).toString(); endpoint = url.href;
    const data = await http.json(url.href, signal);
    if (!Array.isArray(data.hits?.hits)) bad('MetaCPAN search has no release hits');
    const total = data.hits.total;
    const totalValue = typeof total === 'number' ? total : total?.value;
    const lowerBound = typeof total === 'object' && total?.relation === 'gte';
    if (!Number.isSafeInteger(totalValue) || totalValue < 0 || typeof total === 'object' && !['eq', 'gte'].includes(total?.relation)) bad('Invalid MetaCPAN total semantics');
    const candidates = data.hits.hits.map((hit: any): Candidate => {
      const row = hit?._source, version = versionText(row?.version);
      if (!row || !string(row.author) || !string(row.name) || !string(row.distribution) || !/^[A-Z][A-Z0-9]{0,31}$/.test(row.author) || !/^[A-Za-z0-9][A-Za-z0-9_.+-]*$/.test(row.name) || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(row.distribution) || !version || version.length > 100 || row.status !== 'latest' || row.authorized !== true || row.maturity !== 'released') bad('Invalid or out-of-scope MetaCPAN release identity');
      return candidate(source, query, row.distribution, `https://metacpan.org/release/${encodeURIComponent(row.author)}/${encodeURIComponent(row.name)}`, row.abstract, version, repository(row.resources?.repository?.url), `https://fastapi.metacpan.org/v1/release/${row.author}/${encodeURIComponent(row.name)}`);
    });
    const partial = data.timed_out !== false || !Number.isSafeInteger(data._shards?.failed) || data._shards.failed > 0 || lowerBound;
    return { endpoint, effectiveQuery, candidates, partial, pagination: pageProgress(page, 6, candidates.length, lowerBound ? undefined : totalValue), notes: ['Official latest authorized released distribution search; distributions and importable Perl modules are different identities.', ...(partial ? ['MetaCPAN reported or did not rule out timeout/shard failure/lower-bound totals; returned candidates are retained with partial coverage.'] : []), 'Fixed release metadata/checksum is read during inspection; source archives and repository correspondence remain unverified.'] };
  }, () => endpoint);
}

function cabalField(text: string, name: string, required = false): string | undefined {
  const values = [...text.matchAll(new RegExp(`^${name}[ \\t]*:[ \\t]*([^\\r\\n]*)`, 'gim'))].map(match => match[1]!.replace(/\s+--.*$/, '').trim());
  if (values.length > 1 || required && (values.length !== 1 || !values[0])) bad(`Missing or ambiguous top-level Cabal ${name}`);
  return values[0];
}

export async function readAdditionalPackage(http: Http, pkg: PackageIdentity, signal: AbortSignal): Promise<PublishedPackage> {
  const name = pkg.name;
  if (pkg.source === 'clojars') {
    const [group, artifact, excess] = name.split('/'); const version = pkg.version;
    if (excess || !group || !artifact || !/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(group) || group.split('.').some(part => !part) || !/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(artifact) || !version || !/^[A-Za-z0-9][A-Za-z0-9_.+-]*$/.test(version)) bad('Invalid fixed Clojars coordinates');
    if (/-SNAPSHOT$/i.test(version) || /^(LATEST|RELEASE)$/i.test(version)) bad('Clojars SNAPSHOT/mutable version resolution is unsupported; no fixed POM is claimed');
    const url = `https://repo.clojars.org/${group.replace(/\./g, '/')}/${artifact}/${encodeURIComponent(version)}/${artifact}-${encodeURIComponent(version)}.pom`;
    const text = await http.text(url, signal, 180_000), identity = readPomIdentity(text);
    if (identity.groupId !== group || identity.artifactId !== artifact || identity.version !== version) bad('Fixed Clojars POM identity disagrees with selected coordinates');
    return { name, version, url, document: identity, extra: { path: 'PUBLISHED.pom', url, content: text }, notes: ['Fixed non-SNAPSHOT POM direct coordinates verified; text retained as data. The conservative XML subset does not resolve entities, prefixed elements, CDATA, parent inheritance or properties.', 'POM license/SCM declarations are retained for host review, not interpreted as verified archive/source correspondence. No package archive or repository code is read.'] };
  }
  if (pkg.source === 'hackage') {
    if (!hackageName(name)) bad('Invalid Hackage package name');
    const versions = await http.json(`https://hackage.haskell.org/package/${name}.json`, signal);
    if (!versions || typeof versions !== 'object' || Array.isArray(versions)) bad('Invalid Hackage version map');
    const normal = Object.keys(versions).filter(version => versions[version] === 'normal' && /^\d+(?:\.\d+)*$/.test(version) && version.length <= 100);
    const compare = (left: string, right: string) => { const a = left.split('.').map(BigInt), b = right.split('.').map(BigInt); for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i] === undefined) return -1; if (b[i] === undefined) return 1; if (a[i]! < b[i]!) return -1; if (a[i]! > b[i]!) return 1; } return 0; };
    const version = pkg.version ?? normal.sort(compare).at(-1);
    if (!version || version.length > 100 || !/^\d+(?:\.\d+)*$/.test(version) || !Object.hasOwn(versions, version)) bad('No matching normal numeric Hackage version');
    const url = `https://hackage.haskell.org/package/${name}-${version}/revisions/`, revisions = await http.json(url, signal);
    if (!Array.isArray(revisions) || !revisions.length || revisions.length > 1000 || revisions.some(row => !row || !Number.isSafeInteger(row.number) || row.number < 0 || !/^[a-f0-9]{64}$/.test(row.sha256)) || new Set(revisions.map(row => row.number)).size !== revisions.length) bad('Invalid Hackage Cabal revision list');
    const revision = revisions.reduce((latest, row) => row.number > latest.number ? row : latest);
    const cabalUrl = `https://hackage.haskell.org/package/${name}-${version}/revision/${revision.number}.cabal`, text = await http.text(cabalUrl, signal, 180_000);
    if (digest(text) !== revision.sha256) bad('Hackage fixed Cabal revision SHA-256 mismatch');
    if (cabalField(text, 'name', true) !== name || cabalField(text, 'version', true) !== version) bad('Hackage Cabal identity disagrees with selected package/version');
    return { name, version, url, document: { name, version, preference: versions[version], revision }, license: cabalField(text, 'license'), extra: { path: 'PUBLISHED.cabal', url: cabalUrl, content: text, ref: `${version}/revision/${revision.number}` }, notes: ['Selected a normal numeric version using Cabal component ordering; fixed Cabal revision identity and SHA-256 verified. Version/preference and revision locator metadata can change and retain hashes.', 'Only top-level Cabal fields are interpreted; source archives, license files and repository-release correspondence are unqueried.'] };
  }
  if (pkg.source !== 'metacpan' || !pkg.version || !pkg.metadataUrl) bad('Missing fixed MetaCPAN release identity');
  let target: URL;
  try { target = new URL(pkg.metadataUrl); } catch { return bad('Invalid fixed MetaCPAN release URL'); }
  const match = target.pathname.match(/^\/v1\/release\/([^/]+)\/([^/]+)$/);
  if (match) {
    try { match[1] = decodeURIComponent(match[1]!); match[2] = decodeURIComponent(match[2]!); } catch { bad('Invalid encoded MetaCPAN release path'); }
  }
  if (target.protocol !== 'https:' || target.hostname !== 'fastapi.metacpan.org' || target.port || target.username || target.password || target.search || target.hash || !match || !/^[A-Z][A-Z0-9]{0,31}$/.test(match[1]!) || !/^[A-Za-z0-9][A-Za-z0-9_.+-]*$/.test(match[2]!)) bad('MetaCPAN fixed release URL violates the official endpoint policy');
  const document = await http.json(target.href, signal), release = document.release;
  if (document.total !== 1 || !release || release.author !== match[1] || release.name !== match[2] || release.distribution !== name || versionText(release.version) !== pkg.version) bad('Fixed MetaCPAN release identity disagrees with search');
  return { name, version: pkg.version, url: target.href, document, repository: repository(release.resources?.repository?.url), license: Array.isArray(release.license) ? release.license.filter((value: unknown) => typeof value === 'string').join('; ') : string(release.license), notes: ['Verified actual author/release path, distribution and version; the release metadata retains any supplied archive checksum. Metadata license identifiers are not inferred SPDX expressions.', 'Source archives/license files are unqueried; a repository URL is publisher metadata and has no verified release commit association.'] };
}

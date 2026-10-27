import { Http, SourceError } from './http.js';
import { outcome, repositoryKey } from './sources.js';
import type { Candidate, PackageIdentity, RegistrySource, SourceResult } from './types.js';

function array(value: unknown, label: string): any[] {
  if (!Array.isArray(value)) throw new SourceError('invalid_response', `Invalid ${label} response`);
  return value;
}
const string = (value: unknown): string | undefined => typeof value === 'string' && value.length > 0 ? value : undefined;
const repo = (...values: unknown[]) => values.find((v): v is string => typeof v === 'string' && Boolean(repositoryKey(v)));
const licenses = (value: unknown): string | undefined => Array.isArray(value) ? value.filter(v => typeof v === 'string').join(' OR ') || undefined : string(value);

function candidate(source: RegistrySource, query: string, name: unknown, url: string, description: unknown, version?: unknown, repository?: unknown, metadataUrl?: string, platform?: string): Candidate {
  if (!string(name) || (version !== undefined && !string(version))) throw new SourceError('invalid_response', `Missing ${source} package identity`);
  const pkg: PackageIdentity = { source, name: name as string, version: string(version), url, metadataUrl, platform };
  return { id: `${source}:${name}`, source, name: pkg.name, url, description: string(description) ?? '', version: pkg.version, repository: string(repository), matchedQueries: [query], packages: [pkg] };
}

export async function nugetResource(http: Http, type: string, signal: AbortSignal): Promise<string> {
  const data = await http.json('https://api.nuget.org/v3/index.json', signal);
  const resource = array(data.resources, 'NuGet service index').find(r => r['@type'] === type);
  if (!string(resource?.['@id'])) throw new SourceError('invalid_response', `NuGet service index has no ${type}`);
  return resource['@id'];
}

export function searchRegistry(http: Http, source: Exclude<RegistrySource, 'npm' | 'pypi'>, query: string, signal: AbortSignal): Promise<SourceResult> {
  return outcome(source, query, signal, async () => {
    let candidates: Candidate[];
    if (source === 'crates') {
      const url = new URL('https://crates.io/api/v1/crates');
      url.search = new URLSearchParams({ q: query, per_page: '6' }).toString();
      const data = await http.json(url.href, signal);
      candidates = array(data.crates, 'crates.io search').slice(0, 6).map(p => candidate(source, query, p.name, `https://crates.io/crates/${encodeURIComponent(p.name)}`, p.description, p.max_stable_version || p.max_version, p.repository));
    } else if (source === 'maven') {
      const url = new URL('https://search.maven.org/solrsearch/select');
      url.search = new URLSearchParams({ q: query, rows: '6', wt: 'json' }).toString();
      const data = await http.json(url.href, signal);
      candidates = array(data.response?.docs, 'Maven search').slice(0, 6).map(p => {
        if (!string(p.g) || !string(p.a)) throw new SourceError('invalid_response', 'Missing Maven coordinates');
        return candidate(source, query, `${p.g}:${p.a}`, `https://central.sonatype.com/artifact/${encodeURIComponent(p.g)}/${encodeURIComponent(p.a)}`, `${p.g}:${p.a} (${p.p ?? 'artifact'})`, p.latestVersion ?? p.v);
      });
    } else if (source === 'nuget') {
      const url = new URL(await nugetResource(http, 'SearchQueryService', signal));
      url.search = new URLSearchParams({ q: query, take: '6', skip: '0', prerelease: 'false', semVerLevel: '2.0.0' }).toString();
      const data = await http.json(url.href, signal);
      candidates = array(data.data, 'NuGet search').slice(0, 6).map(p => {
        const c = candidate(source, query, p.id, `https://www.nuget.org/packages/${encodeURIComponent(p.id)}`, p.description, p.version, repo(p.projectUrl), string(p.versions?.find((v: any) => v.version === p.version)?.['@id']));
        c.packages![0]!.registrationUrl = string(p.registration);
        return c;
      });
    } else if (source === 'rubygems') {
      const url = new URL('https://rubygems.org/api/v1/search.json');
      url.search = new URLSearchParams({ query, page: '1' }).toString();
      candidates = array(await http.json(url.href, signal), 'RubyGems search').slice(0, 6).map(p => candidate(source, query, p.name, `https://rubygems.org/gems/${encodeURIComponent(p.name)}`, p.info, p.version, repo(p.source_code_uri, p.metadata?.source_code_uri), undefined, string(p.platform)));
    } else {
      const url = new URL('https://packagist.org/search.json');
      url.search = new URLSearchParams({ q: query, per_page: '6' }).toString();
      const data = await http.json(url.href, signal);
      candidates = array(data.results, 'Packagist search').slice(0, 6).map(p => candidate(source, query, p.name, `https://packagist.org/packages/${encodeURIComponent(p.name).replace('%2F', '/')}`, p.description, undefined, p.repository));
    }
    return { candidates, effectiveQuery: query, notes: ['Bounded first-page package metadata discovery; not exhaustive recall or global source-code search.', ...(source === 'maven' ? ['Maven query syntax searches artifact coordinates; natural-language needs may require shorter technical terms.'] : [])] };
  });
}

export interface PublishedPackage {
  name: string;
  version: string;
  url: string;
  document: unknown;
  repository?: string;
  ref?: string;
  license?: string;
  notes: string[];
  extra?: { path: string; url: string; content: string };
}

export async function readPublishedPackage(http: Http, pkg: PackageIdentity, signal: AbortSignal): Promise<PublishedPackage> {
  const name = pkg.name;
  let version = pkg.version;
  let url: string;
  let p: any;
  let repository: string | undefined;
  let ref: string | undefined;
  let license: string | undefined;
  let extra: PublishedPackage['extra'];
  const notes: string[] = [];
  if (pkg.source === 'crates') {
    if (!/^[\w-]+$/.test(name) || !version) throw new Error('Missing fixed crates.io package identity');
    url = `https://crates.io/api/v1/crates/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
    p = (await http.json(url, signal)).version;
    if (p?.crate !== name || p.num !== version) throw new Error('Published crate name/version disagrees with search');
    repository = repo(p.repository);
    license = string(p.license);
  } else if (pkg.source === 'rubygems') {
    if (!/^[A-Za-z0-9_.-]+$/.test(name) || !version) throw new Error('Missing fixed RubyGems package identity');
    const target = new URL(`https://rubygems.org/api/v2/rubygems/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}.json`);
    if (pkg.platform) target.searchParams.set('platform', pkg.platform);
    url = target.href;
    p = await http.json(url, signal);
    if (p.name !== name || p.version !== version || (pkg.platform && p.platform !== pkg.platform)) throw new Error('Published gem identity disagrees with search');
    repository = repo(p.source_code_uri, p.metadata?.source_code_uri);
    license = licenses(p.licenses);
  } else if (pkg.source === 'packagist') {
    if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(name)) throw new Error('Invalid Composer package name');
    url = `https://packagist.org/packages/${name}.json`;
    const data = (await http.json(url, signal)).package;
    if (data?.name !== name) throw new Error('Packagist package name disagrees with search');
    const versions = Object.values(data.versions ?? {}) as any[];
    p = version ? versions.find(v => v.version === version) : versions.filter(v => /^v?\d+\.\d+\.\d+$/.test(v.version)).sort((a, b) => (b.version.replace(/^v/, '').split('.').map(Number) as number[]).reduce((delta, n, i) => delta || n - Number(a.version.replace(/^v/, '').split('.')[i]), 0))[0];
    if (!p?.version || p.name !== name) throw new Error('No matching stable Packagist version in bounded metadata');
    version = p.version;
    repository = repo(p.source?.url, data.repository);
    if (p.source?.type === 'git' && repo(p.source.url) && /^[a-f0-9]{40,64}$/.test(p.source.reference)) ref = p.source.reference;
    license = licenses(p.license);
    notes.push('Packagist metadata URL lists versions and is mutable; evidence retains the selected version and content hash.');
  } else if (pkg.source === 'nuget') {
    if (!version || (!pkg.metadataUrl && !pkg.registrationUrl)) throw new Error('NuGet search did not supply a registration URL');
    let registration = pkg.registrationUrl;
    let leaf;
    if (!registration && pkg.metadataUrl) {
      leaf = await http.json(pkg.metadataUrl, signal);
      registration = string(leaf.registration);
    }
    if (registration) {
      url = registration;
      const index = await http.json(registration, signal);
      let found: any;
      // Search newest pages first, preserving a finite metadata read budget.
      for (const page of array(index.items, 'NuGet registration index').slice().reverse().slice(0, 4)) {
        let items = page.items;
        let pageUrl = registration;
        if (!Array.isArray(items)) {
          if (!string(page['@id'])) throw new Error('NuGet registration page has no URL');
          pageUrl = page['@id'];
          items = (await http.json(pageUrl, signal)).items;
        }
        found = array(items, 'NuGet registration page').find(item => item.catalogEntry?.version?.toLowerCase() === version!.toLowerCase());
        if (found) { p = found.catalogEntry; url = pageUrl; break; }
      }
      if (!found) throw new Error('Fixed NuGet version not found within four registration pages');
      notes.push('Selected fixed version from the discovered registration index/pages (up to four pages); the container URL is mutable and evidence includes a content hash.');
    } else {
      if (!string(leaf?.catalogEntry)) throw new Error('NuGet registration leaf has no catalog URL');
      url = leaf.catalogEntry;
      p = await http.json(url, signal);
    }
    if (p.id?.toLowerCase() !== name.toLowerCase() || p.version?.toLowerCase() !== version.toLowerCase()) throw new Error('NuGet catalog identity disagrees with search');
    repository = repo(p.projectUrl);
    license = string(p.licenseExpression);
    notes.push('NuGet projectUrl is publisher metadata; repository/package code correspondence remains unverified.');
  } else if (pkg.source === 'maven') {
    const parts = name.split(':');
    if (parts.length !== 2 || parts.some(s => !/^[\w.-]+$/.test(s) || s.split('.').some(p => !p)) || !version || !/^[\w.+-]+$/.test(version)) throw new Error('Invalid fixed Maven coordinates');
    const [group, artifact] = parts as [string, string];
    url = `https://repo.maven.apache.org/maven2/${group.replace(/\./g, '/')}/${artifact}/${encodeURIComponent(version)}/${artifact}-${encodeURIComponent(version)}.pom`;
    const text = await http.text(url, signal, 500_000);
    if (!/<(?:\w+:)?project[\s>]/.test(text)) throw new Error('Maven endpoint did not return a POM');
    p = { groupId: group, artifactId: artifact, version, pomUrl: url };
    extra = { path: 'PUBLISHED.pom', url, content: text };
    notes.push('Pinned POM retained as text. SCM, parent inheritance and license expressions require host review; no POM code is executed.');
  } else throw new Error('Unsupported registry evidence source');
  return { name, version: version!, url, document: p, repository, ref, license, notes, extra };
}

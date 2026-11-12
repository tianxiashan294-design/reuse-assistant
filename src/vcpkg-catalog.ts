import { gitObjectId } from './cpp-git.js';
import { SourceError } from './http.js';
import type { CatalogEntry, CatalogGit, CatalogInspection, CatalogSnapshot, GitText } from './cpp-git.js';
import type { PackageIdentity } from './types.js';

const baselinePath = 'versions/baseline.json';
const baselineLimit = 500_000;
const evidenceLimit = 180_000;
const versionFields = ['version', 'version-semver', 'version-date', 'version-string'] as const;
const portName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function invalid(message: string, url?: string): never {
  throw new SourceError('invalid_response', message, undefined, undefined, url);
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function parseJson(file: GitText): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(file.content); }
  catch { return invalid('Invalid vcpkg registry JSON', file.url); }
  return object(value) ?? invalid('Invalid vcpkg registry JSON object', file.url);
}

function defaultBaseline(file: GitText): Record<string, unknown> {
  return object(parseJson(file).default) ?? invalid('Missing vcpkg default baseline', file.url);
}

function version(value: unknown, portVersion: unknown) {
  if (typeof value !== 'string' || !value.trim() || /[#\u0000-\u001f\u007f]/.test(value)) return undefined;
  if (typeof portVersion !== 'number' || !Number.isSafeInteger(portVersion) || portVersion < 0) return undefined;
  return { portVersion, display: portVersion ? value + '#' + portVersion : value };
}

function baselineVersion(entry: unknown) {
  const row = object(entry);
  return row && version(row.baseline, row['port-version']);
}

function declaredVersion(row: Record<string, unknown>) {
  const fields = versionFields.filter(field => Object.hasOwn(row, field));
  if (fields.length !== 1) return undefined;
  const scheme = fields[0]!;
  const exact = version(row[scheme], Object.hasOwn(row, 'port-version') ? row['port-version'] : 0);
  return exact && { ...exact, scheme };
}

export async function readVcpkgCatalog(git: CatalogGit): Promise<CatalogSnapshot> {
  const { revision } = await git.head();
  const file = await git.file(revision, baselinePath, baselineLimit);
  const entries: CatalogEntry[] = [];
  let rejected = 0;
  for (const [name, entry] of Object.entries(defaultBaseline(file))) {
    const fixed = baselineVersion(entry);
    if (portName.test(name) && fixed) entries.push({ name, version: fixed.display });
    else rejected++;
  }
  return {
    revision, endpoint: file.url, entries, partial: rejected > 0,
    notes: [
      'Name matching uses the default vcpkg baseline at the fixed registry commit. Baseline versions describe the port catalog. Project dependency resolution is outside this lookup.',
      ...(rejected ? ['Skipped ' + rejected + ' invalid vcpkg default baseline entries.'] : []),
    ],
  };
}

function controlIdentity(content: string) {
  const header = content.trimStart().split(/\r?\n[ \t]*\r?\n/, 1)[0]!;
  const sources = [...header.matchAll(/^Source:[ \t]*(\S[^\r\n]*)$/gm)];
  const versions = [...header.matchAll(/^Version:[ \t]*(\S[^\r\n]*)$/gm)];
  const portVersions = [...header.matchAll(/^Port-Version:[ \t]*(\d+)[ \t]*$/gm)];
  const portVersionFields = [...header.matchAll(/^Port-Version:/gm)];
  if (sources.length !== 1 || versions.length !== 1 || portVersionFields.length > 1 || portVersions.length !== portVersionFields.length) return undefined;
  const fixed = version(versions[0]![1]!.trimEnd(), Number(portVersions[0]?.[1] ?? 0));
  return fixed && { name: sources[0]![1]!.trimEnd(), display: fixed.display };
}

export async function inspectVcpkgCatalog(git: CatalogGit, pkg: PackageIdentity, evidence: CatalogInspection): Promise<void> {
  const { name, version: selectedVersion, catalogRevision: revision, catalogTree: expectedTree } = pkg;
  evidence.notes.push('vcpkg evidence covers the curated registry baseline and the selected port tree. Upstream source and archives, build behavior, and upstream license files remain outside this inspection.');
  if (!portName.test(name) || !gitObjectId(revision) || !selectedVersion) {
    await evidence.attempt('vcpkg port identity', async () => invalid('Missing or invalid fixed vcpkg port identity'));
    return;
  }
  const registry: Record<string, unknown> = {
    source: 'vcpkg', name, version: selectedVersion, catalogRevision: revision,
    baselineVerified: false, versionVerified: false, portIdentityVerified: false,
  };
  evidence.metadata.registry = registry;

  const baseline = await evidence.attempt('vcpkg fixed baseline', async () => {
    const file = await git.file(revision, baselinePath, baselineLimit);
    const rows = defaultBaseline(file);
    const fixed = baselineVersion(Object.hasOwn(rows, name) ? rows[name] : undefined);
    if (fixed?.display !== selectedVersion) invalid('vcpkg baseline disagrees with the selected port version', file.url);
    evidence.add(baselinePath, file, revision);
    registry.baselineVerified = true;
    registry.portVersion = fixed.portVersion;
    return fixed;
  });

  const versionsPath = 'versions/' + name[0] + '-/' + name + '.json';
  const fixed = await evidence.attempt('vcpkg fixed versions file', async () => {
    const file = await git.file(revision, versionsPath, evidenceLimit);
    const rows = parseJson(file).versions;
    if (!Array.isArray(rows)) return invalid('Missing vcpkg versions list', file.url);
    const matches = rows.flatMap(raw => {
      const row = object(raw);
      if (!row) return [];
      const parsed = declaredVersion(row);
      return parsed?.display === selectedVersion ? [{ ...parsed, tree: row['git-tree'] }] : [];
    });
    const match = matches[0];
    if (matches.length !== 1 || !match || !gitObjectId(match.tree) || (expectedTree !== undefined && match.tree !== expectedTree)) {
      return invalid('vcpkg versions file has no unique fixed tree for the selected port version', file.url);
    }
    evidence.add(versionsPath, file, revision);
    registry.versionVerified = true;
    registry.portTree = match.tree;
    registry.versionScheme = match.scheme;
    return { ...match, tree: match.tree };
  });
  if (!baseline || !fixed) return;

  const portTree = await evidence.attempt('vcpkg fixed port tree', () => git.tree(fixed.tree));
  if (!portTree) return;
  if (portTree.truncated) evidence.notes.push('GitHub truncated the selected vcpkg port tree. Available port files can still be read.');

  const portPath = 'ports/' + name + '/';
  const manifest = portTree.entries.find(entry => entry.path === 'vcpkg.json');
  const metadataFile = manifest ?? (!portTree.truncated ? portTree.entries.find(entry => entry.path === 'CONTROL') : undefined);
  const portfile = portTree.entries.find(entry => entry.path === 'portfile.cmake');
  await evidence.attempt('vcpkg port manifest', async () => {
    if (!metadataFile || metadataFile.type !== 'blob' || !/^100(?:644|755)$/.test(metadataFile.mode)) {
      return invalid('No regular vcpkg.json or legacy CONTROL file found in the selected port tree', portTree.url);
    }
    const file = await git.blob(metadataFile.sha, evidenceLimit);
    if (metadataFile.path === 'vcpkg.json') {
      const body = parseJson(file);
      const identity = declaredVersion(body);
      if (body.name !== name || identity?.display !== selectedVersion || identity.scheme !== fixed.scheme) {
        return invalid('vcpkg.json identity disagrees with the selected port and version', file.url);
      }
      if (typeof body.license === 'string' || body.license === null) registry.license = body.license;
    } else {
      const identity = controlIdentity(file.content);
      if (identity?.name !== name || identity.display !== selectedVersion) {
        return invalid('vcpkg CONTROL identity disagrees with the selected port and version', file.url);
      }
    }
    evidence.add(portPath + metadataFile.path, file, fixed.tree);
    registry.portIdentityVerified = true;
  });
  await evidence.attempt('vcpkg portfile', async () => {
    if (!portfile || portfile.type !== 'blob' || !/^100(?:644|755)$/.test(portfile.mode)) {
      return invalid('No regular portfile.cmake found in the selected port tree', portTree.url);
    }
    const file = await git.blob(portfile.sha, evidenceLimit);
    evidence.add(portPath + 'portfile.cmake', file, fixed.tree);
  });
}

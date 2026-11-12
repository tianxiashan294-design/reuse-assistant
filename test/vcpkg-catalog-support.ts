import { createHash } from 'node:crypto';
import { json } from './support.js';

const repo = '/repos/microsoft/vcpkg';
export const vcpkgRevision = 'a'.repeat(40);
export const zlibPortTree = 'c'.repeat(40);
export const legacyPortTree = 'd'.repeat(40);

export interface VcpkgFixtureOptions {
  extraPorts?: Record<string, unknown>;
  zlibVersion?: string;
  duplicateVersion?: boolean;
  manifestName?: string;
  corruptManifestBlob?: boolean;
  manifestSymlink?: boolean;
}

function blob(content: string) {
  const data = Buffer.from(content);
  return {
    sha: createHash('sha1').update('blob ' + data.length + '\0').update(data).digest('hex'),
    size: data.length,
    encoding: 'base64',
    content: data.toString('base64'),
  };
}

function contents(path: string, data: unknown): Response {
  return json({ path, type: 'file', ...blob(JSON.stringify(data)) });
}

function treeEntry(path: string, sha: string, mode = '100644') {
  return { path, sha, mode, type: 'blob' };
}

export function vcpkgCatalogResponse(url: URL, options: VcpkgFixtureOptions = {}): Response | undefined {
  if (url.hostname !== 'api.github.com' || !url.pathname.startsWith(repo + '/')) return undefined;
  const path = url.pathname.slice(repo.length);
  if (path === '/commits/HEAD' && !url.search) {
    return json({ sha: vcpkgRevision, commit: { tree: { sha: 'b'.repeat(40) } } });
  }
  if (path.startsWith('/contents/')) {
    if (url.search !== '?ref=' + vcpkgRevision) return undefined;
    const file = path.slice('/contents/'.length);
    if (file === 'versions/baseline.json') {
      return contents(file, { default: {
        zlib: { baseline: options.zlibVersion ?? '1.3.2', 'port-version': 3 },
        '7zip': { baseline: '1.0', 'port-version': 0 },
        ...options.extraPorts,
      } });
    }
    if (file === 'versions/z-/zlib.json') {
      const selected = { 'git-tree': zlibPortTree, version: '1.3.2', 'port-version': 3 };
      const earlier = { 'git-tree': 'e'.repeat(40), version: '1.3.2', 'port-version': 2 };
      return contents(file, { versions: [earlier, selected, ...(options.duplicateVersion ? [selected] : [])] });
    }
    if (file === 'versions/7-/7zip.json') {
      return contents(file, { versions: [{ 'git-tree': legacyPortTree, 'version-string': '1.0', 'port-version': 0 }] });
    }
  }
  if (url.search) return undefined;

  const manifest = blob(JSON.stringify({ name: options.manifestName ?? 'zlib', version: '1.3.2', 'port-version': 3, license: 'Zlib' }));
  const control = blob('Source: 7zip\r\nVersion: 1.0\r\nDescription: A legacy port\r\n\r\nFeature: tools\r\nDescription: Command line tools\r\n');
  const portfile = blob('vcpkg_from_github(OUT_SOURCE_PATH SOURCE_PATH REPO example/upstream REF v1 SHA512 test)\n');
  if (path === '/git/trees/' + zlibPortTree) {
    return json({ sha: zlibPortTree, truncated: false, tree: [
      treeEntry('vcpkg.json', manifest.sha, options.manifestSymlink ? '120000' : '100644'),
      treeEntry('portfile.cmake', portfile.sha),
    ] });
  }
  if (path === '/git/trees/' + legacyPortTree) {
    return json({ sha: legacyPortTree, truncated: false, tree: [
      treeEntry('CONTROL', control.sha),
      treeEntry('portfile.cmake', portfile.sha),
    ] });
  }
  if (path === '/git/blobs/' + manifest.sha) {
    if (!options.corruptManifestBlob) return json(manifest);
    const changed = Buffer.from(manifest.content, 'base64');
    changed[0] = 0x2e;
    return json({ ...manifest, content: changed.toString('base64') });
  }
  if (path === '/git/blobs/' + control.sha) return json(control);
  if (path === '/git/blobs/' + portfile.sha) return json(portfile);
  return undefined;
}

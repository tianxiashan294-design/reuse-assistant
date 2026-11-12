import assert from 'node:assert/strict';
import test from 'node:test';
import { ReuseAssistant } from '../src/core.js';
import { Http } from '../src/http.js';
import type { CheckInput } from '../src/types.js';
import { fakeFetch, fixture } from './support.js';
import { legacyPortTree, vcpkgCatalogResponse, vcpkgRevision, zlibPortTree, type VcpkgFixtureOptions } from './vcpkg-catalog-support.js';

const request: CheckInput = {
  task: 'Find packaged compression libraries',
  queries: ['zlib'],
  sources: ['vcpkg'],
  useCache: false,
};

function setup(root: string, options: VcpkgFixtureOptions) {
  const seen: URL[] = [];
  const core = new ReuseAssistant(root, new Http(fakeFetch(url => {
    seen.push(url);
    const response = vcpkgCatalogResponse(url, options);
    if (!response) throw new Error('Unexpected vcpkg fixture request ' + url.href);
    return response;
  }), '', ''));
  return { core, seen };
}

test('vcpkg shares one fixed default baseline across local pages and preserves port revision identity', async t => {
  const extraPorts = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [
    'zlib-addon-' + i, { baseline: '2.0', 'port-version': 0 },
  ]));
  const { core, seen } = setup(await fixture(t), { extraPorts });
  const check = await core.check({ ...request, queries: ['ZLIB', '7zip'] });
  const matches = check.sources.find(source => source.query === 'ZLIB');
  assert.equal(check.coverage, 'complete');
  assert.equal(matches?.catalogRevision, vcpkgRevision);
  assert.equal(matches?.pagination?.mode, 'local');
  assert.equal(matches?.pagination?.pagesFetched, 2);
  assert.equal(matches?.pagination?.itemsFetched, 7);
  assert.equal(matches?.pagination?.totalAvailable, 7);
  assert.equal(matches?.pagination?.stopReason, 'exhausted');
  const zlib = check.candidates.find(c => c.id === 'vcpkg:zlib');
  assert.equal(zlib?.version, '1.3.2#3');
  assert.equal(zlib?.repository, undefined);
  assert.equal(zlib?.packages?.[0]?.catalogRevision, vcpkgRevision);
  assert.equal(zlib?.url, 'https://github.com/microsoft/vcpkg/tree/' + vcpkgRevision + '/ports/zlib');
  assert.equal(seen.length, 2);

  const evidence = await core.inspect(check.id, 'vcpkg:zlib');
  assert.equal(evidence.status, 'partial');
  assert.deepEqual(evidence.errors, []);
  assert.deepEqual(evidence.files.map(f => [f.path, f.ref]), [
    ['versions/baseline.json', vcpkgRevision],
    ['versions/z-/zlib.json', vcpkgRevision],
    ['ports/zlib/vcpkg.json', zlibPortTree],
    ['ports/zlib/portfile.cmake', zlibPortTree],
  ]);
  assert.deepEqual(evidence.metadata.registry, {
    source: 'vcpkg', name: 'zlib', version: '1.3.2#3', catalogRevision: vcpkgRevision,
    portTree: zlibPortTree, portVersion: 3, versionScheme: 'version', license: 'Zlib',
    baselineVerified: true, versionVerified: true, portIdentityVerified: true,
  });
  assert.equal(evidence.metadata.license, undefined);
  assert(evidence.files.every(f => /^[a-f0-9]{64}$/.test(f.sha256)));
  assert.equal(seen.filter(url => url.pathname.endsWith('/commits/HEAD')).length, 1);
  assert(seen.every(url => url.hostname === 'api.github.com' && url.pathname.startsWith('/repos/microsoft/vcpkg/')));
});

test('vcpkg verifies legacy CONTROL identity using the numeric port name prefix', async t => {
  const { core, seen } = setup(await fixture(t), {});
  const check = await core.check({ ...request, queries: ['7zip'] });
  const evidence = await core.inspect(check.id, 'vcpkg:7zip');
  assert.equal(evidence.status, 'partial');
  assert.deepEqual(evidence.errors, []);
  assert.equal((evidence.metadata.registry as Record<string, unknown>).portIdentityVerified, true);
  assert.equal(evidence.files.find(f => f.path === 'ports/7zip/CONTROL')?.ref, legacyPortTree);
  assert(seen.some(url => url.pathname.endsWith('/versions/7-/7zip.json') && url.searchParams.get('ref') === vcpkgRevision));
});

test('vcpkg preserves valid baseline matches and reports invalid catalog entries as partial coverage', async t => {
  const { core } = setup(await fixture(t), { extraPorts: {
    'zlib/escape': { baseline: '1.0', 'port-version': 0 },
    'zlib-negative': { baseline: '1.0', 'port-version': -1 },
  } });
  const check = await core.check(request);
  const source = check.sources.find(row => row.source === 'vcpkg')!;
  assert.equal(check.coverage, 'partial');
  assert.equal(source.status, 'partial');
  assert.deepEqual(source.candidates.map(c => c.id), ['vcpkg:zlib']);
  assert.match(source.notes.join(' '), /Skipped 2 invalid vcpkg default baseline entries/);
});

test('vcpkg keeps the independently verified metadata and stops on conflicting pinned identities', async t => {
  const cases = [
    { change: { zlibVersion: '1.4.0' }, error: /baseline disagrees/, file: 'versions/z-/zlib.json' },
    { change: { duplicateVersion: true }, error: /no unique fixed tree/, file: 'versions/baseline.json' },
  ];
  for (const { change, error, file } of cases) {
    const options: VcpkgFixtureOptions = {};
    const { core, seen } = setup(await fixture(t), options);
    const check = await core.check(request);
    Object.assign(options, change);
    const evidence = await core.inspect(check.id, 'vcpkg:zlib');
    assert.equal(evidence.status, 'partial');
    assert.match(evidence.errors.join(' '), error);
    assert.deepEqual(evidence.files.map(f => f.path), [file]);
    assert(seen.every(url => !url.pathname.includes('/git/trees/')));
  }
});

test('vcpkg preserves the pinned portfile when manifest identity, hash or object type fails', async t => {
  const cases = [
    { options: { manifestName: 'other' }, error: /identity disagrees/ },
    { options: { corruptManifestBlob: true }, error: /hash does not match/ },
    { options: { manifestSymlink: true }, error: /No regular vcpkg.json/ },
  ];
  for (const { options, error } of cases) {
    const { core, seen } = setup(await fixture(t), options);
    const check = await core.check(request);
    const evidence = await core.inspect(check.id, 'vcpkg:zlib');
    assert.equal(evidence.status, 'partial');
    assert.match(evidence.errors.join(' '), error);
    assert.equal((evidence.metadata.registry as Record<string, unknown>).portIdentityVerified, false);
    assert.deepEqual(evidence.files.map(f => f.path), [
      'versions/baseline.json', 'versions/z-/zlib.json', 'ports/zlib/portfile.cmake',
    ]);
    if ('manifestSymlink' in options) {
      assert.equal(seen.filter(url => url.pathname.includes('/git/blobs/')).length, 1);
    }
  }
});

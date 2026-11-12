import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import { ReuseAssistant } from '../src/core.js';
import { Http } from '../src/http.js';
import type { CheckInput } from '../src/types.js';
import {
  conanCatalogPath, conanCatalogResponse, conanConfig, conanHeadPath, conanRecipe, conanRecipeTree, conanRevision,
  type ConanCatalogOptions,
} from './conan-catalog-support.js';
import { fakeFetch, fixture } from './support.js';

const input: CheckInput = {
  task: 'Check known Conan recipe names',
  queries: ['SCHEDULER', 'zlib'],
  sources: ['conan'],
  maxPages: 2,
  useCache: false,
};

async function setup(t: TestContext, options: ConanCatalogOptions = {}) {
  const seen: URL[] = [];
  const http = new Http(fakeFetch(url => {
    seen.push(url);
    const response = conanCatalogResponse(url, options);
    if (!response) throw new Error('Unexpected Conan fixture URL: ' + url.href);
    return response;
  }), '', '');
  return { core: new ReuseAssistant(await fixture(t), http), seen };
}

test('Conan pages literal names from one fixed catalog shared by all queries', async t => {
  const { core, seen } = await setup(t);
  const report = await core.check(input);
  const [scheduler, zlib] = report.sources.filter(source => source.source === 'conan');
  assert.equal(report.coverage, 'complete');
  assert.equal(seen.length, 3);
  assert.equal(seen[0]?.pathname, conanHeadPath);
  assert.equal(seen[2]?.pathname, conanCatalogPath);
  assert(seen.every(url => url.search === ''));
  assert.equal(scheduler?.effectiveQuery, 'scheduler');
  assert.equal(scheduler?.status, 'ok');
  assert.equal(scheduler?.catalogRevision, conanRevision);
  assert.deepEqual(scheduler?.candidates.map(candidate => candidate.name), Array.from({ length: 8 }, (_, i) => 'scheduler-' + i));
  assert.deepEqual(scheduler?.pagination, {
    mode: 'local', pageSize: 6, pagesFetched: 2, itemsFetched: 8, totalAvailable: 8, hasMore: false, stopReason: 'exhausted', next: undefined,
  });
  assert.equal(zlib?.catalogRevision, conanRevision);
  assert.deepEqual(zlib?.candidates.map(candidate => candidate.name), ['zlib']);
  const candidate = report.candidates.find(candidate => candidate.id === 'conan:zlib');
  assert.equal(candidate?.version, undefined);
  assert.equal(candidate?.repository, undefined);
  assert.equal(candidate?.packages?.[0]?.catalogTree, conanRecipeTree);
  assert.equal(candidate?.url, 'https://github.com/conan-io/conan-center-index/tree/' + conanRevision + '/recipes/zlib');
});

test('Conan tree truncation retains available candidates and partial coverage', async t => {
  const { core } = await setup(t, { truncated: true });
  const report = await core.check({ ...input, maxPages: 1 });
  assert.equal(report.coverage, 'partial');
  const sources = report.sources.filter(source => source.source === 'conan');
  assert(sources.every(source => source.status === 'partial' && source.notes.some(note => /truncated Conan catalog tree/i.test(note))));
  assert.equal(sources[0]?.candidates.length, 6);
  assert.equal(sources[0]?.pagination?.hasMore, true);
  assert.equal(sources[0]?.pagination?.stopReason, 'page_limit');
  assert.equal(sources[1]?.candidates[0]?.id, 'conan:zlib');
});

test('Conan resets failed shared catalog loads and retains original retry provenance', async t => {
  const { core, seen } = await setup(t, { failCatalogOnce: true });
  const report = await core.check(input);
  assert.equal(report.coverage, 'complete');
  assert.equal(seen.filter(url => url.pathname === conanHeadPath).length, 2);
  assert.equal(seen.filter(url => url.pathname === conanCatalogPath).length, 2);
  for (const source of report.sources.filter(source => source.source === 'conan')) {
    assert.equal(source.status, 'ok');
    assert.equal(source.catalogRevision, conanRevision);
    assert.equal(source.failures?.length, 1);
    assert.equal(source.failures?.[0]?.page, 1);
    assert.equal(source.failures?.[0]?.retry, 'recovered');
    assert.equal(source.failures?.[0]?.error.code, 'http_error');
    assert.equal(source.failures?.[0]?.error.status, 503);
    assert.equal(source.failures?.[0]?.error.endpoint, 'https://api.github.com' + conanCatalogPath);
  }
});

test('Conan preserves good fixed recipe evidence when a separate blob fails integrity', async t => {
  const options = { corruptConandata: true };
  const { core, seen } = await setup(t, options);
  const report = await core.check({ ...input, queries: ['zlib'] });
  const evidence = await core.inspect(report.id, 'conan:zlib', ['README.md']);
  assert.equal(evidence.status, 'partial');
  assert.deepEqual(evidence.metadata.registry, { source: 'conan', name: 'zlib', catalogRevision: conanRevision, recipeTree: conanRecipeTree });
  assert.equal(evidence.metadata.license, undefined);
  assert.deepEqual(evidence.files.map(file => [file.path, file.content, file.ref]), [
    ['recipes/zlib/config.yml', conanConfig, conanRevision],
    ['recipes/zlib/all/conanfile.py', conanRecipe, conanRevision],
  ]);
  for (const file of evidence.files) assert.equal(file.sha256, createHash('sha256').update(file.content).digest('hex'));
  assert(evidence.errors.some(error => /conandata\.yml.*hash does not match/i.test(error)));
  assert(evidence.errors.some(error => /requested repository paths/i.test(error)));
  assert(evidence.notes.some(note => /RREV.*package licenses remain unverified/.test(note)));
  await assert.rejects(core.decide({
    checkId: report.id, choice: 'adapt_code', status: 'planned', candidateIds: ['conan:zlib'], evidenceIds: [evidence.id],
    rationale: 'Ensure a packaging recipe cannot authorize adaptation without separate license evidence.', acknowledgeIncomplete: true,
  }), /identified license/);

  options.corruptConandata = false;
  const completeFiles = await core.inspect(report.id, 'conan:zlib');
  assert.equal(completeFiles.status, 'partial');
  assert.equal(completeFiles.errors.length, 0);
  assert.equal(completeFiles.files.length, 3);
  assert(seen.every(url => url.origin === 'https://api.github.com'));
  assert.equal(seen.filter(url => url.pathname === conanHeadPath).length, 1);
});

test('Conan rejects a hash-valid binary recipe without discarding sibling text files', async t => {
  const { core } = await setup(t, { binaryRecipe: true });
  const report = await core.check({ ...input, queries: ['zlib'] });
  const evidence = await core.inspect(report.id, 'conan:zlib');
  assert.equal(evidence.status, 'partial');
  assert.deepEqual(evidence.files.map(file => file.path), ['recipes/zlib/config.yml', 'recipes/zlib/all/conandata.yml']);
  assert.equal(evidence.errors.length, 1);
  assert.match(evidence.errors[0]!, /conanfile\.py.*contains a NUL byte/);
});

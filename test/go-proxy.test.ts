import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { ReuseAssistant } from '../src/core.js';
import { Http } from '../src/http.js';
import type { CheckInput, CheckReport, Inspection } from '../src/types.js';
import { fakeFetch, fixture, json } from './support.js';
import {
  goProxy, goProxyResponse, latestInfo, latestInfoPath, latestMod, latestModPath, latestVersion,
  modulePath, olderInfoPath, olderVersion, proxyPath,
} from './go-proxy-support.js';

const base: CheckInput = {
  task: 'Verify official Go module proxy coordinates',
  queries: ['background queue'],
  sources: ['goproxy'],
  maxPages: 3,
  useCache: false,
};
const exact = { path: modulePath, version: latestVersion };
const latestId = 'goproxy:' + modulePath + '@' + latestVersion;
const olderId = 'goproxy:' + modulePath + '@' + olderVersion;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const proxyResult = (report: CheckReport) => report.sources.find(source => source.source === 'goproxy')!;

test('known Go lookup resolves a locator to fixed coordinates and keeps separate versions', async t => {
  const urls: string[] = [];
  const core = new ReuseAssistant(await fixture(t), new Http(fakeFetch((url, init) => {
    urls.push(url.href);
    assert.equal(url.origin, goProxy);
    assert.equal(new Headers(init?.headers).get('Authorization'), null);
    assert.equal(new Headers(init?.headers).get('Private-Token'), null);
    return goProxyResponse(url);
  }), 'github-test-token', 'gitlab-test-token'));
  const report = await core.check({ ...base, goModules: [{ path: modulePath }, { path: modulePath, version: olderVersion }] });
  assert.equal(report.coverage, 'complete');
  assert.deepEqual(report.queryPlan?.map(entry => entry.query), base.queries);
  assert.deepEqual(urls.slice().sort(), [proxyPath + '/@latest', latestInfoPath, olderInfoPath].map(p => goProxy + p).sort());
  const capability = report.sourcePlan?.find(source => source.source === 'goproxy');
  assert.equal(capability?.mode, 'name_verification');
  assert.equal(capability?.selected, true);
  assert.deepEqual(report.candidates.map(candidate => candidate.id).sort(), [latestId, olderId].sort());
  for (const source of report.sources.filter(result => result.source === 'goproxy')) {
    assert.equal(source.status, 'ok');
    assert.equal(source.candidates.length, 1);
    assert.equal(source.pagination?.stopReason, 'lookup');
    assert.equal(source.pagination?.hasMore, false);
  }
  for (const candidate of report.candidates) {
    assert.equal(candidate.name, modulePath);
    assert.equal(candidate.packages?.[0]?.version, candidate.version);
    assert.equal(candidate.repository, undefined);
  }

  const beforeInspection = urls.length;
  const evidence = await core.inspect(report.id, latestId, ['README.md']);
  assert.deepEqual(urls.slice(beforeInspection).sort(), [goProxy + latestInfoPath, goProxy + latestModPath].sort());
  assert.equal(evidence.status, 'partial');
  assert.deepEqual(evidence.metadata.registry, {
    source: 'goproxy', name: modulePath, version: latestVersion, versionVerified: true, modulePathVerified: true,
  });
  assert.match([...evidence.errors, ...evidence.notes].join(' '), /repository|source/i);
  const info = evidence.files.find(file => file.path === 'PUBLISHED.info');
  const mod = evidence.files.find(file => file.path === 'PUBLISHED.go.mod');
  assert.equal(info?.url, goProxy + latestInfoPath);
  assert.equal(info?.sha256, sha(latestInfo));
  assert.equal(info?.ref, latestVersion);
  assert.equal(mod?.url, goProxy + latestModPath);
  assert.equal(mod?.content, latestMod);
  assert.equal(mod?.sha256, sha(latestMod));
  assert.equal(mod?.ref, latestVersion);
  const oldEvidence = await core.inspect(report.id, olderId);
  assert(oldEvidence.files.every(file => file.ref === olderVersion));
  assert.equal(oldEvidence.files.length, 2);
});

test('Go known coordinates do not come from query text and isolate cache and source selection', async t => {
  const urls: URL[] = [];
  const core = new ReuseAssistant(await fixture(t), new Http(fakeFetch(url => {
    urls.push(url);
    return goProxyResponse(url);
  }), '', ''));
  const skipped = await core.check({ ...base, queries: [modulePath], useCache: true });
  assert.equal(proxyResult(skipped).status, 'skipped');
  assert.equal(urls.length, 0);

  const request = { ...base, queries: [modulePath], useCache: true, goModules: [exact] };
  const lookup = await core.check(request);
  assert.equal(lookup.cached, false);
  assert.notEqual(lookup.contextHash, skipped.contextHash);
  assert.equal((await core.check(request)).cached, true);
  assert.deepEqual(urls.map(url => url.pathname), [latestInfoPath]);

  const older = await core.check({ ...request, goModules: [{ ...exact, version: olderVersion }] });
  assert.equal(older.cached, false);
  assert.notEqual(older.contextHash, lookup.contextHash);
  assert.deepEqual(urls.map(url => url.pathname), [latestInfoPath, olderInfoPath]);

  const before = urls.length;
  const local = await core.check({ ...request, scope: 'local' });
  assert.equal(local.sourcePlan?.find(source => source.source === 'goproxy')?.selected, false);
  assert.equal(urls.length, before);
  const routed = await core.check({ ...request, ecosystem: 'go', sources: undefined });
  assert.deepEqual(routed.sources.map(source => source.source), ['local', 'github', 'gitlab', 'goproxy']);
  await assert.rejects(core.check({ ...request, sources: ['github'] }), /goproxy/i);
});

test('Go canonical versions handle gopkg.in, legacy incompatible and pseudo versions', async t => {
  const core = new ReuseAssistant(await fixture(t), new Http(fakeFetch(goProxyResponse), '', ''));
  const goModules = [
    { path: 'gopkg.in/yaml.v3', version: 'v3.0.1' },
    { path: 'example.org/legacy', version: 'v3.2.1+incompatible' },
    { path: 'example.org/pseudo', version: 'v0.0.0-20250101000000-aaaaaaaaaaaa' },
  ];
  const report = await core.check({ ...base, goModules });
  assert.equal(report.coverage, 'complete');
  assert.deepEqual(report.candidates.map(c => c.id).sort(), goModules.map(module => 'goproxy:' + module.path + '@' + module.version).sort());
});

test('invalid Go coordinates fail before requests, including URL and major-version mismatches', async t => {
  let calls = 0;
  const core = new ReuseAssistant(await fixture(t), new Http(fakeFetch(url => {
    calls++;
    return goProxyResponse(url);
  }), '', ''));
  for (const goModules of [
    [{ path: 'https://example.com/repo' }],
    [{ path: 'example.com/../repo' }],
    [{ path: 'example.com/%2f/repo' }],
    [{ path: 'example.com/repo?private=true' }],
    [{ path: 'example.com/repo\n' }],
    [{ path: 'example.com/repo/v01' }],
    [{ path: 'gopkg.in/yaml' }],
    [{ path: 'gopkg.in/yaml.v0-unstable' }],
    [{ path: 'gopkg.in/yaml.v3', version: 'v2.0.0' }],
    [{ path: modulePath, version: 'v1.0.0' }],
    [{ path: modulePath, version: 'v2.1' }],
    [{ path: modulePath, version: 'v2.1.0-01' }],
    [{ path: modulePath, version: 'v2.1.0+build.1' }],
    [{ path: modulePath, version: 'main' }],
    Array.from({ length: 4 }, () => exact),
  ]) await assert.rejects(core.check({ ...base, goModules }));
  assert.equal(calls, 0);
});

test('Go proxy failures and recovered retries preserve status, endpoint and bounded lookup coverage', async t => {
  let status = 404;
  let calls = 0;
  let returnMismatch = false;
  const core = new ReuseAssistant(await fixture(t), new Http(fakeFetch(url => {
    calls++;
    if (status) {
      const current = status;
      if (status === 503) status = 0;
      return json({}, current);
    }
    if (returnMismatch) return json({ Version: olderVersion });
    return goProxyResponse(url);
  }), '', ''));
  const request = { ...base, goModules: [exact] };
  for (const httpStatus of [404, 410]) {
    status = httpStatus;
    const report = await core.check(request);
    const result = proxyResult(report);
    assert.equal(report.coverage, 'partial');
    assert.equal(result.error?.status, httpStatus);
    assert.equal(result.error?.endpoint, goProxy + latestInfoPath);
    assert.equal(result.failures?.[0]?.retry, 'not_retried');
    assert.deepEqual(result.candidates, []);
  }
  assert.equal(calls, 2);

  status = 503;
  const recovered = await core.check(request);
  assert.equal(proxyResult(recovered).status, 'ok');
  assert.equal(proxyResult(recovered).failures?.[0]?.error.status, 503);
  assert.equal(proxyResult(recovered).failures?.[0]?.retry, 'recovered');
  assert.equal(calls, 4);

  returnMismatch = true;
  const malformed = proxyResult(await core.check(request));
  assert.equal(malformed.error?.code, 'invalid_response');
  assert.equal(malformed.failures?.[0]?.retry, 'not_retried');
  assert.equal(calls, 5);
});

test('Go inspection keeps independently valid evidence when pinned metadata fails', async t => {
  let infoFailure = false;
  let modContent = latestMod;
  const urls: string[] = [];
  const core = new ReuseAssistant(await fixture(t), new Http(fakeFetch(url => {
    urls.push(url.href);
    if (infoFailure && url.pathname === latestInfoPath) return json({}, 503);
    if (url.pathname === latestModPath) return new Response(modContent);
    return goProxyResponse(url);
  }), '', ''));
  const report = await core.check({ ...base, goModules: [exact] });
  for (const invalid of [
    latestMod.replace(modulePath, 'example.com/team/queue/v2'),
    `require (\n  module ${modulePath}\n)\n`,
    'module `' + modulePath + '`\n',
  ]) {
    modContent = invalid;
    const mismatch = await core.inspect(report.id, latestId);
    assert.equal(mismatch.status, 'partial');
    assert.deepEqual(mismatch.files.map(file => file.path), ['PUBLISHED.info']);
    assert(mismatch.errors.length > 0);
    assert.deepEqual(mismatch.metadata.registry, {
      source: 'goproxy', name: modulePath, version: latestVersion, versionVerified: true, modulePathVerified: false,
    });
  }
  modContent = `module ${modulePath}// no space before comment\n`;
  infoFailure = true;
  const failedInfo = await core.inspect(report.id, latestId);
  assert.equal(failedInfo.status, 'partial');
  assert(failedInfo.files.some(file => file.path === 'PUBLISHED.go.mod'));
  assert.match(failedInfo.errors.join(' '), /503/);
  assert.deepEqual(failedInfo.metadata.registry, {
    source: 'goproxy', name: modulePath, version: latestVersion, versionVerified: false, modulePathVerified: true,
  });
  assert(urls.every(url => url.startsWith(goProxy + proxyPath + '/@v/')));
});

test('compiled CLI and real MCP stdio expose the shared Go check and inspection', async t => {
  const root = await fixture(t);
  const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
  const preload = new URL('./go-proxy-preload.js', import.meta.url).href;
  const run = async (...args: string[]) => {
    const { stdout } = await promisify(execFile)(process.execPath, ['--import', preload, cli, ...args, '--project', root]);
    return JSON.parse(stdout);
  };
  const cliReport: CheckReport = await run(
    'check', '--task', base.task, '--query', base.queries[0]!, '--source', 'goproxy',
    '--go-module', modulePath + '@' + latestVersion, '--go-module', 'gopkg.in/yaml.v3@v3.0.1', '--json',
  );
  assert.deepEqual(cliReport.input.goModules, [exact, { path: 'gopkg.in/yaml.v3', version: 'v3.0.1' }]);
  const cliEvidence: Inspection = await run('inspect', '--check', cliReport.id, '--candidate', latestId);
  assert.equal(cliEvidence.files.find(file => file.path === 'PUBLISHED.go.mod')?.sha256, sha(latestMod));

  const requestFile = path.join(root, 'go-request.json');
  await writeFile(requestFile, JSON.stringify({ ...base, goModules: [{ path: modulePath }] }));
  const jsonReport: CheckReport = await run('check', '--input', requestFile, '--json');
  assert.equal(proxyResult(jsonReport).candidates[0]?.id, latestId);

  const client = new Client({ name: 'go-proxy-acceptance', version: '1.0.0' });
  t.after(async () => { await client.close(); });
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: ['--import', preload, cli, 'mcp', '--project', root],
    stderr: 'pipe',
  }));
  const listing = await client.listTools();
  assert(listing.tools.find(tool => tool.name === 'check_reuse')?.inputSchema.properties?.goModules);
  const check = await client.callTool({ name: 'check_reuse', arguments: { ...base, goModules: [exact] } });
  assert.notEqual(check.isError, true, JSON.stringify(check));
  const report: CheckReport = JSON.parse((check.content as { text: string }[])[0]!.text);
  assert.equal(proxyResult(report).candidates[0]?.id, latestId);
  const inspect = await client.callTool({ name: 'inspect_candidate', arguments: { checkId: report.id, candidateId: latestId } });
  assert.notEqual(inspect.isError, true, JSON.stringify(inspect));
  const evidence: Inspection = JSON.parse((inspect.content as { text: string }[])[0]!.text);
  assert.equal(evidence.files.find(file => file.path === 'PUBLISHED.info')?.sha256, sha(latestInfo));
  const invalid = await client.callTool({ name: 'check_reuse', arguments: { ...base, goModules: [{ path: modulePath, version: 'HEAD' }] } });
  assert.equal(invalid.isError, true);
});

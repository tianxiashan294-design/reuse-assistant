import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import type { CheckReport, Inspection } from '../src/types.js';
import { fixture } from './support.js';

test('compiled CLI and real MCP stdio expose fixed C and C++ package catalog inspection', async t => {
  const root = await fixture(t);
  const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
  const preload = new URL('./cpp-catalog-preload.js', import.meta.url).href;
  const task = 'Find packaging evidence for a C compression library';
  const run = async (...args: string[]) => (await promisify(execFile)(process.execPath, ['--import', preload, cli, ...args, '--project', root])).stdout;
  const report: CheckReport = JSON.parse(await run('check', '--task', task, '--query', 'zlib', '--ecosystem', 'cpp', '--source', 'conan', '--source', 'vcpkg', '--json'));
  assert.equal(report.coverage, 'complete');
  assert.deepEqual(report.input.sources, ['conan', 'vcpkg']);
  const conan = report.sources.find(source => source.source === 'conan');
  assert.match(conan?.catalogRevision ?? '', /^[a-f0-9]{40}$/);
  assert(conan?.candidates.some(candidate => candidate.id === 'conan:zlib'));
  const vcpkg = report.sources.find(source => source.source === 'vcpkg');
  assert(vcpkg?.candidates.some(candidate => candidate.id === 'vcpkg:zlib'));
  const evidence: Inspection = JSON.parse(await run('inspect', '--check', report.id, '--candidate', 'conan:zlib'));
  assert.equal(evidence.status, 'partial');
  assert(evidence.files.some(file => file.path === 'recipes/zlib/config.yml' && file.ref === conan?.catalogRevision));

  const client = new Client({ name: 'cpp-catalog-acceptance', version: '1.0.0' });
  t.after(async () => { await client.close(); });
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: ['--import', preload, cli, 'mcp', '--project', root],
    stderr: 'pipe',
  }));
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    return JSON.parse((result.content as { text: string }[])[0]!.text);
  };
  const mcp: CheckReport = await call('check_reuse', { task, queries: ['zlib'], ecosystem: 'c' });
  assert.deepEqual(mcp.input.sources, ['github', 'gitlab', 'conan', 'vcpkg']);
  const candidate = mcp.candidates.find(result => result.id === 'vcpkg:zlib');
  assert(candidate);
  const port: Inspection = await call('inspect_candidate', { checkId: mcp.id, candidateId: candidate.id });
  assert.equal(port.status, 'partial');
  assert.deepEqual(port.errors, []);
  assert(port.files.some(file => file.path === 'ports/zlib/vcpkg.json' && file.ref !== candidate.packages?.[0]?.catalogRevision));
  assert.equal((port.metadata.registry as Record<string, unknown>).portIdentityVerified, true);
});

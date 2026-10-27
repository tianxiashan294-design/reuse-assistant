import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cliPath } from '../src/install.js';
import { fixture } from './support.js';

test('real stdio SDK client completes check -> inspect -> decide through the published tools', { timeout: 20000 }, async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'retry.ts'), 'export const retryRequest = () => "existing implementation";');
  const transport = new StdioClientTransport({ command: process.execPath, args: [cliPath, 'mcp', '--project', root], stderr: 'pipe' });
  const client = new Client({ name: 'reuse-assistant-acceptance', version: '0.1.0' });
  t.after(async () => { await client.close(); });
  await client.connect(transport);
  const listing = await client.listTools();
  assert.deepEqual(listing.tools.map(t => t.name).sort(), ['check_reuse', 'inspect_candidate', 'record_decision']);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result: any = await client.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true, result.content?.[0]?.text);
    return JSON.parse(result.content[0].text);
  };
  const report = await call('check_reuse', { task: 'Add retryRequest support', queries: ['retryRequest'], scope: 'local' });
  const candidate = report.candidates.find((c: any) => c.localPath === 'retry.ts');
  assert(candidate);
  const evidence = await call('inspect_candidate', { checkId: report.id, candidateId: candidate.id });
  const decision = await call('record_decision', { checkId: report.id, candidateIds: [candidate.id], evidenceIds: [evidence.id], choice: 'reuse_local', rationale: 'The existing retryRequest already implements the requested behavior', status: 'planned' });
  assert.equal(decision.choice, 'reuse_local');
  const bad: any = await client.callTool({ name: 'record_decision', arguments: { checkId: report.id, choice: 'adopt_dependency', rationale: 'Invented evidence must not authorize adoption', candidateIds: ['npm:nonexistent'], status: 'planned' } });
  assert.equal(bad.isError, true);
});

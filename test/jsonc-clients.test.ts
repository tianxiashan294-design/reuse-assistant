import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, readFile, readdir, rename, symlink, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { parse, type ParseError } from 'jsonc-parser';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { cliPath } from '../src/install.js';
import { fixture } from './support.js';

const exec = promisify(execFile);
const receiptPath = '.reuse-assistant/integrations/opencode.json';
const cli = async (root: string, ...args: string[]) => JSON.parse((await exec(process.execPath,
  [cliPath, ...args, '--project', root, '--client', 'opencode'], { timeout: 20000 })).stdout);

function config(text: string): any {
  const errors: ParseError[] = [];
  const value = parse(text.replace(/^\uFEFF/, ''), errors, { allowTrailingComma: true });
  assert.deepEqual(errors, []);
  return value;
}

// Include directories so a rejected preflight cannot leave generated folders.
async function snapshot(root: string, relative = ''): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      result[`${name}/`] = '';
      Object.assign(result, await snapshot(root, name));
    } else result[name] = (await readFile(path.join(root, name))).toString('base64');
  }
  return result;
}

test('OpenCode JSONC public CLI preserves comments, BOM, CRLF and unrelated values through the lifecycle', async t => {
  const root = await fixture(t);
  const original = '\uFEFF' + [
    '// 用户保留的配置说明 😀',
    '{',
    '\t"theme": "everforest", // theme stays inline',
    '\t"mcp": {',
    '\t\t// another server stays documented',
    '\t\t"before": { "type": "local", "command": ["keep-before"] }, // before inline',
    '\t\t/* retain this trailing object comment */',
    '\t}, // mcp inline',
    '\t// settings after the MCP object',
    '\t"instructions": ["keep.md"], // instructions inline',
    '}',
    '// end-of-file note',
    '',
  ].join('\r\n');
  const file = path.join(root, 'opencode.jsonc');
  await writeFile(file, original);
  const installed = await cli(root, 'init');
  assert.equal(installed.mcpConfig, file);
  const first = await readFile(file, 'utf8');
  const saved = JSON.parse(await readFile(path.join(root, receiptPath), 'utf8'));
  assert.equal(saved.version, 1);
  assert.equal(saved.config, 'opencode.jsonc');
  const comments = original.split('\r\n').filter(line => line.includes('//') || line.includes('/*')).map(line =>
    line.slice(line.includes('//') ? line.indexOf('//') : line.indexOf('/*')));
  for (const comment of comments) assert(first.includes(comment), `lost comment during init: ${comment}`);
  assert(first.startsWith('\uFEFF'));
  assert(!/(?<!\r)\n/.test(first), 'CRLF input should not acquire lone LF line endings');
  assert(first.includes('\t"theme": "everforest", // theme stays inline'));
  assert.deepEqual(config(first).mcp.before, { type: 'local', command: ['keep-before'] });
  assert.deepEqual(config(first).instructions, ['keep.md']);
  assert.equal(config(first).mcp.reuse_assistant.enabled, true);
  await assert.rejects(readFile(path.join(root, 'opencode.json')), /ENOENT/);
  const afterFirst = await snapshot(root);
  await cli(root, 'init');
  assert.deepEqual(await snapshot(root), afterFirst, 'repeated init must be bytewise idempotent');
  const health = await cli(root, 'doctor');
  assert.equal(health.serverConfigured, true);
  assert.equal(health.skillInstalled, true);
  assert.equal(health.instructionsInstalled, true);
  assert.deepEqual(health.issues, []);
  assert.match(health.capability.mcpRuntimeLoaded, /not verified/);
  const removed = await cli(root, 'uninstall');
  assert.deepEqual(removed.retained, []);
  const remaining = await readFile(file, 'utf8');
  for (const comment of comments) assert(remaining.includes(comment), `lost comment during uninstall: ${comment}`);
  assert(remaining.startsWith('\uFEFF'));
  assert(!/(?<!\r)\n/.test(remaining));
  assert.equal(config(remaining).mcp.reuse_assistant, undefined);
  assert.deepEqual(config(remaining).mcp.before, { type: 'local', command: ['keep-before'] });
  assert.equal(config(remaining).theme, 'everforest');
  assert.deepEqual(config(remaining).instructions, ['keep.md']);
  await assert.rejects(readFile(path.join(root, receiptPath)), /ENOENT/);
  assert.deepEqual((await cli(root, 'uninstall')).changed, []);
});

test('OpenCode accepts JSONC syntax in opencode.json and keeps v1 JSON receipt ownership', async t => {
  const root = await fixture(t);
  const file = path.join(root, 'opencode.json');
  await writeFile(file, '{\n  // JSON filename with comments and trailing commas\n  "theme": "keep",\n}\n');
  const installed = await cli(root, 'init');
  assert.equal(installed.mcpConfig, file);
  const saved = JSON.parse(await readFile(path.join(root, receiptPath), 'utf8'));
  assert.equal(saved.version, 1);
  assert.equal(saved.config, 'opencode.json');
  await cli(root, 'init');
  assert.deepEqual((await cli(root, 'doctor')).issues, []);
  await cli(root, 'uninstall');
  const remaining = await readFile(file, 'utf8');
  assert(remaining.includes('// JSON filename with comments and trailing commas'));
  assert.equal(config(remaining).theme, 'keep');
  assert.equal(config(remaining).mcp.reuse_assistant, undefined);
});

test('OpenCode rejects malformed, non-object and duplicate decoded JSONC keys before any writes', async t => {
  const invalid = [
    '{broken', '[]', 'null', '42', '// no root object\n',
    '{"mcp": false}',
    '{"mcp":{}, "mcp":{}}',
    '{"mcp":{}, "m\\u0063p":{}}',
    '{"mcp":{"reuse_assistant":{}, "reuse_assistant":{}}}',
    '{"unrelated":{"nested":1,"nested":2}}',
    '{"unrelated":[{"a":1,"\\u0061":2}]}',
  ];
  for (const text of invalid) {
    const root = await fixture(t);
    await writeFile(path.join(root, 'opencode.jsonc'), text);
    await writeFile(path.join(root, 'AGENTS.md'), '# User guidance\n');
    const before = await snapshot(root);
    await assert.rejects(cli(root, 'init'), /JSON|object|duplicate/i, text);
    assert.deepEqual(await snapshot(root), before, `invalid input changed project: ${text}`);
    const health = await cli(root, 'doctor');
    assert.equal(health.serverConfigured, false);
    assert(health.issues.length, `doctor should report invalid input: ${text}`);
  }
});

test('OpenCode refuses both config filenames before init or uninstall writes and doctor diagnoses the conflict', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'opencode.json'), '{"theme":"keep JSON"}\n');
  await writeFile(path.join(root, 'opencode.jsonc'), '// keep JSONC\n{}\n');
  const beforeInit = await snapshot(root);
  await assert.rejects(cli(root, 'init'), /both|ambig|conflict/i);
  assert.deepEqual(await snapshot(root), beforeInit);
  assert((await cli(root, 'doctor')).issues.some((s: string) => /both|ambig|conflict/i.test(s)));
  await unlink(path.join(root, 'opencode.json'));
  await cli(root, 'init');
  await writeFile(path.join(root, 'opencode.json'), '{"theme":"new counterpart"}\n');
  const beforeUninstall = await snapshot(root);
  await assert.rejects(cli(root, 'uninstall'), /both|ambig|conflict/i);
  assert.deepEqual(await snapshot(root), beforeUninstall);
});

test('OpenCode repairs a missing owned config but rejects moving the receipt-selected file to its counterpart', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'opencode.jsonc'), '// original owned file\n{}\n');
  await cli(root, 'init');
  await unlink(path.join(root, 'opencode.jsonc'));
  const repaired = await cli(root, 'init');
  assert.equal(repaired.mcpConfig, path.join(root, 'opencode.jsonc'));
  assert.equal((await cli(root, 'doctor')).serverConfigured, true);
  await assert.rejects(readFile(path.join(root, 'opencode.json')), /ENOENT/);
  await rename(path.join(root, 'opencode.jsonc'), path.join(root, 'opencode.json'));
  const before = await snapshot(root);
  await assert.rejects(cli(root, 'init'), /receipt|moved|config|path/i);
  assert.deepEqual(await snapshot(root), before);
  await assert.rejects(cli(root, 'uninstall'), /receipt|moved|config|path/i);
  assert.deepEqual(await snapshot(root), before);
  const health = await cli(root, 'doctor');
  assert(health.issues.some((s: string) => /receipt|moved|config|path/i.test(s)));
});

test('OpenCode retains modified managed JSONC values and the ownership receipt on uninstall', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'opencode.jsonc'), '// user-owned commentary\n{}\n');
  const installed = await cli(root, 'init');
  const original = await readFile(installed.mcpConfig, 'utf8');
  const changed = original.replace(/"enabled"\s*:\s*true/, '"enabled": false');
  assert.notEqual(changed, original);
  await writeFile(installed.mcpConfig, changed);
  const before = await snapshot(root);
  await assert.rejects(cli(root, 'init'), /modified|unmanaged/i);
  assert.deepEqual(await snapshot(root), before);
  const health = await cli(root, 'doctor');
  assert.equal(health.serverConfigured, false);
  assert(health.issues.length);
  const result = await cli(root, 'uninstall');
  assert(result.retained.includes('opencode.jsonc'));
  assert.equal(await readFile(installed.mcpConfig, 'utf8'), changed);
  assert.equal(JSON.parse(await readFile(path.join(root, receiptPath), 'utf8')).config, 'opencode.jsonc');
});

test('OpenCode removes first, middle, last and sole trailing-comma entries without consuming adjacent comments', async t => {
  const layouts = [
    (server: string) => `/* first */ "reuse_assistant": ${server}, // next server\n"other": true,`,
    (server: string) => `"before": true, // before inline\n/* middle */ "reuse_assistant": ${server}, /* next */ "other": true`,
    (server: string) => `"before": true, // before inline\n/* last */ "reuse_assistant": ${server}, /* tail */`,
    (server: string) => `/* sole */ "reuse_assistant": ${server}, // tail\n`,
  ];
  for (const layout of layouts) {
    const root = await fixture(t);
    await writeFile(path.join(root, 'opencode.jsonc'), '{}');
    const installed = await cli(root, 'init');
    const entry = JSON.stringify(config(await readFile(installed.mcpConfig, 'utf8')).mcp.reuse_assistant);
    const text = `{ "mcp": { ${layout(entry)} } }`;
    await writeFile(installed.mcpConfig, text);
    const comments = text.match(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g) ?? [];
    const before = config(text).mcp;
    await cli(root, 'init');
    assert.equal(await readFile(installed.mcpConfig, 'utf8'), text);
    await cli(root, 'uninstall');
    const remaining = await readFile(installed.mcpConfig, 'utf8');
    for (const comment of comments) assert(remaining.includes(comment), comment);
    delete before.reuse_assistant;
    assert.deepEqual(config(remaining).mcp, before);
  }
});

test('OpenCode refuses corrupt owned configuration before uninstall can remove skills or instructions', async t => {
  for (const text of ['{broken', '{"mcp":false}', '{"mcp":{},"mcp":{}}']) {
    const root = await fixture(t);
    await writeFile(path.join(root, 'opencode.jsonc'), '{}');
    const installed = await cli(root, 'init');
    await writeFile(installed.mcpConfig, text);
    const before = await snapshot(root);
    await assert.rejects(cli(root, 'uninstall'), /JSON|object|duplicate/i);
    assert.deepEqual(await snapshot(root), before);
  }
});

test('OpenCode rejects symlinked JSONC config targets without writing to either project or target', async t => {
  const parent = await fixture(t);
  const root = path.join(parent, 'project');
  const outside = path.join(parent, 'outside');
  await mkdir(root); await mkdir(outside);
  const externalFile = path.join(outside, 'opencode.jsonc');
  const original = '// external configuration\n{}\n';
  await writeFile(externalFile, original);
  try { await symlink(externalFile, path.join(root, 'opencode.jsonc'), 'file'); }
  catch (error: any) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) {
      t.skip('Windows file symlink creation is unavailable in this test environment.');
      return;
    }
    throw error;
  }
  await assert.rejects(cli(root, 'init'), /regular project path|symbolic|symlink/i);
  assert.equal(await readFile(externalFile, 'utf8'), original);
  assert.deepEqual(await readdir(root), ['opencode.jsonc']);
  assert.deepEqual(await readdir(outside), ['opencode.jsonc']);
});

test('OpenCode JSONC generated command completes the public SDK MCP workflow and linked decisions', { timeout: 30000 }, async t => {
  const parent = await fixture(t);
  const root = path.join(parent, 'JSONC 项目 空格 & $value');
  await mkdir(root);
  await writeFile(path.join(root, 'opencode.jsonc'), '// keep during host-independent transport check\n{}\n');
  await writeFile(path.join(root, 'helper.ts'), 'export function jsoncConnectionHelper() { return 42; }\n');
  const installed = await cli(root, 'init');
  const [command, ...args] = config(await readFile(installed.mcpConfig, 'utf8')).mcp.reuse_assistant.command as string[];
  assert(command);
  const client = new Client({ name: 'opencode-jsonc-config-test', version: '1.1.0' });
  const transport = new StdioClientTransport({ command, args, cwd: root, stderr: 'pipe' });
  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion()?.version, '1.1.0');
    assert.deepEqual((await client.listTools()).tools.map(x => x.name).sort(), ['assess_alignment', 'check_reuse', 'inspect_candidate', 'record_decision']);
    const call = async (name: string, input: Record<string, unknown>) => {
      const result: any = await client.callTool({ name, arguments: input });
      assert.notEqual(result.isError, true, result.content?.[0]?.text);
      return JSON.parse(result.content[0].text);
    };
    const report = await call('check_reuse', { task: 'Validate a JSONC-generated MCP launch command', queries: ['jsoncConnectionHelper'], scope: 'local',
      alignment: { requirements: [{ id: 'shared-core', description: 'Use common project records and the existing four MCP tools' }] } });
    assert.equal(report.projectRoot, root);
    const candidate = report.candidates.find((c: any) => c.localPath === 'helper.ts');
    assert(candidate);
    const inspected = await call('inspect_candidate', { checkId: report.id, candidateId: candidate.id });
    assert(inspected.analysis.segments.length);
    const alignment = await call('assess_alignment', { checkId: report.id, choice: 'build_new',
      claims: ['task', 'shared-core'].map(requirementId => ({ requirementId, verdict: 'supported', rationale: 'The generated configuration connects the unchanged shared MCP tools to this fixture project.' })),
      alternatives: [
        { kind: 'keep_existing', summary: 'Keep strict-JSON-only setup', tradeoffs: 'Existing JSONC projects require manual configuration.' },
        { kind: 'selected', summary: 'Use JSONC project setup with the same MCP command', tradeoffs: 'Adds config parsing while retaining core records and tool behavior.' },
      ], integration: { target: 'Public stdio MCP transport', compatibility: 'Same four tools and decision schemas', validationPlan: 'Invoke all tools and linked decisions through the generated command' } });
    assert.equal(alignment.status, 'ready');
    const common = { checkId: report.id, choice: 'build_new', alignmentId: alignment.id, rationale: 'JSONC configuration launches the existing public MCP interface.' };
    const planned = await call('record_decision', { ...common, status: 'planned' });
    const applied = await call('record_decision', { ...common, status: 'applied', previousDecisionId: planned.id });
    const verified = await call('record_decision', { ...common, status: 'verified', previousDecisionId: applied.id,
      validation: 'Offline SDK stdio workflow passes all four tools and linked decisions; actual OpenCode host activation is unverified.' });
    assert.equal(verified.status, 'verified');
    const fromCli = JSON.parse((await exec(process.execPath, [cliPath, 'report', '--project', root, '--check', report.id, '--json'], { timeout: 20000 })).stdout);
    assert.equal(fromCli.latestDecision.id, verified.id);
  } finally { await client.close(); }
});

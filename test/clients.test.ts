import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { cliPath } from '../src/install.js';
import { fixture } from './support.js';

const exec = promisify(execFile);
const clients = ['claude-code', 'opencode', 'deepseek-harness'] as const;
const cli = async (root: string, ...args: string[]) => JSON.parse((await exec(process.execPath, [cliPath, ...args, '--project', root], { timeout: 20000 })).stdout);
const configPath = (client: string) => client === 'claude-code' ? '.mcp.json' : client === 'opencode' ? 'opencode.json' : '.dsh/reuse-assistant.cordis.patch.yml';

for (const name of clients) {
  test(`${name}: public CLI setup, repeat, doctor and selective uninstall`, async t => {
    const root = await fixture(t);
    const instructions = name === 'claude-code' ? 'CLAUDE.md' : 'AGENTS.md';
    await writeFile(path.join(root, instructions), '# User instructions\nKeep this.\n');
    if (name !== 'deepseek-harness') {
      await writeFile(path.join(root, configPath(name)), JSON.stringify({ userSetting: true, [name === 'claude-code' ? 'mcpServers' : 'mcp']: { other: { command: 'keep-other' } } }));
    }
    const installed = await cli(root, 'init', '--client', name);
    assert.equal(installed.client, name);
    assert.equal(installed.capability.shellWriteGuard, false);
    assert.match(installed.capability.patchGuard, /not implemented/);
    const before = await readFile(installed.mcpConfig, 'utf8');
    const firstInstructions = await readFile(path.join(root, instructions), 'utf8');
    await cli(root, 'init', '--client', name);
    assert.equal(await readFile(installed.mcpConfig, 'utf8'), before);
    assert.equal(await readFile(path.join(root, instructions), 'utf8'), firstInstructions);
    const health = await cli(root, 'doctor', '--client', name);
    assert.equal(health.serverConfigured, true);
    assert.equal(health.skillInstalled, true);
    assert.equal(health.instructionsInstalled, true);
    assert.deepEqual(health.issues, []);
    assert.match(health.capability.mcpRuntimeLoaded, /not verified/);
    const skill = await readFile(installed.skill, 'utf8');
    for (const match of skill.matchAll(/\]\((references\/[^)]+)\)/g)) {
      assert((await readFile(path.join(path.dirname(installed.skill), match[1]!), 'utf8')).length);
    }
    if (name === 'deepseek-harness') {
      assert.deepEqual(installed.launch.args.slice(0, 3), ['--profile', 'web', '--patch']);
      assert.match(before, /@deepseek-ai\/dsh-mcp-client/);
      assert.match(before, /GITHUB_TOKEN: !!js process.env.GITHUB_TOKEN/);
    }
    const removal = await cli(root, 'uninstall', '--client', name);
    assert.deepEqual(removal.retained, []);
    assert.equal(await readFile(path.join(root, instructions), 'utf8'), '# User instructions\nKeep this.\n');
    if (name !== 'deepseek-harness') {
      const remaining = JSON.parse(await readFile(installed.mcpConfig, 'utf8'));
      assert.equal(remaining.userSetting, true);
      const section = remaining[name === 'claude-code' ? 'mcpServers' : 'mcp'];
      assert.equal(section.other.command, 'keep-other');
      assert.equal(section.reuse_assistant, undefined);
    }
    assert.match(await readFile(path.join(root, '.gitignore'), 'utf8'), /.reuse-assistant\//);
    assert.deepEqual((await cli(root, 'uninstall', '--client', name)).changed, []);
    assert.equal((await cli(root, 'doctor', '--client', name)).serverConfigured, false);
  });

  test(`${name}: generated launch command completes all four MCP tools and decision stages`, { timeout: 30000 }, async t => {
    const parent = await fixture(t);
    const root = path.join(parent, 'project 空格 & $value');
    await mkdir(root);
    await writeFile(path.join(root, 'helper.ts'), 'export function existingHelper() { return 42; }\n');
    const installed = await cli(root, 'init', '--client', name);
    const text = await readFile(installed.mcpConfig, 'utf8');
    let command: string;
    let args: string[];
    if (name === 'deepseek-harness') {
      command = JSON.parse(text.match(/^        command: (.+)$/m)![1]!);
      args = JSON.parse(text.match(/^        args: (.+)$/m)![1]!);
    } else {
      const config = JSON.parse(text);
      const entry = config[name === 'claude-code' ? 'mcpServers' : 'mcp'].reuse_assistant;
      if (name === 'opencode') [command, ...args] = entry.command;
      else { command = entry.command; args = entry.args; }
    }
    const client = new Client({ name: `${name}-configuration-test`, version: '1.0.0' });
    const transport = new StdioClientTransport({ command, args, cwd: root, stderr: 'pipe' });
    try {
    await client.connect(transport);
    assert.equal(client.getServerVersion()?.version, '1.0.0');
    assert.deepEqual((await client.listTools()).tools.map(x => x.name).sort(), ['assess_alignment', 'check_reuse', 'inspect_candidate', 'record_decision']);
    const call = async (tool: string, input: Record<string, unknown>) => {
      const result: any = await client.callTool({ name: tool, arguments: input });
      assert.notEqual(result.isError, true, result.content?.[0]?.text);
      return JSON.parse(result.content[0].text);
    };
    const report = await call('check_reuse', { task: 'Validate a new agent connection', queries: ['existingHelper'], scope: 'local', alignment: { requirements: [{ id: 'shared-core', description: 'Use common project records' }] } });
    assert.equal(report.projectRoot, root);
    assert.equal(report.sources[0].source, 'local');
    assert(report.sourcePlan.some((s: any) => s.selected === false));
    const candidate = report.candidates.find((c: any) => c.localPath === 'helper.ts');
    const inspection = await call('inspect_candidate', { checkId: report.id, candidateId: candidate.id });
    assert(inspection.analysis.segments.length);
    const alignment = await call('assess_alignment', { checkId: report.id, choice: 'build_new', claims: ['task', 'shared-core'].map(requirementId => ({ requirementId, verdict: 'supported', rationale: 'New host connection uses shared project records and public core tools.' })), alternatives: [{ kind: 'keep_existing', summary: 'Keep prior client only', tradeoffs: 'No new host support' }, { kind: 'selected', summary: 'Use the new client adapter', tradeoffs: 'Same core records with native configuration' }], integration: { target: 'public MCP interface', compatibility: 'Same four tool contracts', validationPlan: 'Exercise SDK stdio and linked decision lifecycle' } });
    assert.equal(alignment.status, 'ready');
    const planned = await call('record_decision', { checkId: report.id, choice: 'build_new', alignmentId: alignment.id, rationale: 'Shared MCP interface meets the client integration test contract', status: 'planned' });
    const applied = await call('record_decision', { checkId: report.id, choice: 'build_new', alignmentId: alignment.id, rationale: 'Client was connected using generated command', status: 'applied', previousDecisionId: planned.id });
    const verified = await call('record_decision', { checkId: report.id, choice: 'build_new', alignmentId: alignment.id, rationale: 'Public MCP round trip succeeded', status: 'verified', previousDecisionId: applied.id, validation: 'Offline SDK test invoked all four tools; this does not establish activation inside an actual agent host.' });
    assert.equal(verified.status, 'verified');
    const fromCli = await cli(root, 'report', '--check', report.id, '--json');
    assert.equal(fromCli.latestDecision.id, verified.id);
    } finally { await client.close(); }
  });

  test(`${name}: modified managed files are retained and never silently replaced`, async t => {
    const root = await fixture(t);
    const installed = await cli(root, 'init', '--client', name);
    await writeFile(installed.skill, '# My replacement skill\n');
    const configBefore = await readFile(installed.mcpConfig, 'utf8');
    await assert.rejects(cli(root, 'init', '--client', name), /Unmanaged or modified/);
    assert.equal(await readFile(installed.mcpConfig, 'utf8'), configBefore);
    assert((await cli(root, 'doctor', '--client', name)).issues.some((s: string) => s.includes('modified')));
    const removal = await cli(root, 'uninstall', '--client', name);
    assert(removal.retained.some((s: string) => s.endsWith('SKILL.md')));
    assert.equal(await readFile(installed.skill, 'utf8'), '# My replacement skill\n');
  });
}

test('new client setup rejects malformed config and collisions before content writes', async t => {
  for (const client of ['claude-code', 'opencode']) {
    for (const text of ['{broken', '[]', '{"mcpServers":42,"mcp":false}', JSON.stringify({ [client === 'claude-code' ? 'mcpServers' : 'mcp']: { reuse_assistant: { command: 'user-owned' } } })]) {
      const root = await fixture(t);
      const file = path.join(root, configPath(client));
      await writeFile(file, text);
      await assert.rejects(cli(root, 'init', '--client', client), /valid JSON|object|unmanaged/);
      assert.equal(await readFile(file, 'utf8'), text);
      await assert.rejects(readFile(path.join(root, client === 'claude-code' ? 'CLAUDE.md' : 'AGENTS.md')), /ENOENT/);
    }
  }
  const root = await fixture(t);
  await writeFile(path.join(root, 'opencode.jsonc'), '// user comment\n{}\n');
  await assert.rejects(cli(root, 'init', '--client', 'opencode'), /opencode.jsonc exists/);
  assert.equal(await readFile(path.join(root, 'opencode.jsonc'), 'utf8'), '// user comment\n{}\n');
});

test('client selection is explicit; unsupported hooks and options fail before setup', async t => {
  const root = await fixture(t);
  for (const client of clients) await assert.rejects(cli(root, 'init', '--client', client, '--hooks'), /only for codex/);
  await assert.rejects(cli(root, 'init', '--client', 'unknown'), /Unknown client/);
  await assert.rejects(cli(root, 'check', '--client', 'opencode'), /only to init/);
  const help = await exec(process.execPath, [cliPath, '--help']);
  for (const client of clients) assert(help.stdout.includes(client));
  const installed = await cli(root, 'init');
  assert.equal(installed.capability.client, 'codex');
});

test('client-specific skills and instruction blocks survive another client uninstall', async t => {
  const root = await fixture(t);
  for (const name of ['codex', ...clients]) await cli(root, 'init', '--client', name);
  await cli(root, 'uninstall', '--client', 'opencode');
  for (const name of ['codex', 'claude-code', 'deepseek-harness']) {
    const health = await cli(root, 'doctor', '--client', name);
    assert.equal(health.serverConfigured, true);
    assert.equal(health.skillInstalled, true);
  }
  assert.match(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), /reuse-assistant:deepseek-harness/);
  await cli(root, 'uninstall', '--client', 'codex');
  assert.equal((await cli(root, 'doctor', '--client', 'deepseek-harness')).skillInstalled, true);
});

test('new adapters reject junction targets before creating directories outside the project', async t => {
  const parent = await fixture(t);
  const root = path.join(parent, 'project');
  const outside = path.join(parent, 'outside');
  await mkdir(root); await mkdir(outside);
  await symlink(outside, path.join(root, '.claude'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(cli(root, 'init', '--client', 'claude-code'), /regular project path/);
  await assert.rejects(readFile(path.join(root, '.mcp.json')), /ENOENT/);
  const { readdir } = await import('node:fs/promises');
  assert.deepEqual(await readdir(outside), []);
});

test('edited MCP entries, overlays and instruction blocks survive uninstall', async t => {
  for (const name of clients) {
    const root = await fixture(t);
    const installed = await cli(root, 'init', '--client', name);
    const instructions = installed.instructions;
    const text = (await readFile(instructions, 'utf8')).replace('Before substantive', 'User custom guidance. Before substantive');
    await writeFile(instructions, text);
    let config = await readFile(installed.mcpConfig, 'utf8');
    if (name === 'deepseek-harness') config += '# user customization\n';
    else {
      const parsed = JSON.parse(config);
      parsed[name === 'claude-code' ? 'mcpServers' : 'mcp'].reuse_assistant.disabledByUser = true;
      config = JSON.stringify(parsed);
    }
    await writeFile(installed.mcpConfig, config);
    await assert.rejects(cli(root, 'init', '--client', name), /modified/);
    const result = await cli(root, 'uninstall', '--client', name);
    assert(result.retained.includes(configPath(name)));
    assert(result.retained.includes(name === 'claude-code' ? 'CLAUDE.md' : 'AGENTS.md'));
    assert.equal(await readFile(installed.mcpConfig, 'utf8'), config);
    assert.equal(await readFile(instructions, 'utf8'), text);
  }
});

test('native token references do not snapshot installer credentials', async t => {
  for (const name of clients) {
    const root = await fixture(t);
    const { stdout } = await exec(process.execPath, [cliPath, 'init', '--project', root, '--client', name], {
      env: { ...process.env, GITHUB_TOKEN: 'test-only-github-sentinel', GITLAB_TOKEN: 'test-only-gitlab-sentinel' }, timeout: 20000,
    });
    const installed = JSON.parse(stdout);
    const text = await readFile(installed.mcpConfig, 'utf8');
    const saved = await readFile(path.join(root, '.reuse-assistant/integrations', `${name}.json`), 'utf8');
    for (const content of [stdout, text, saved]) assert(!content.includes('test-only-'));
    if (name === 'claude-code') assert.deepEqual(JSON.parse(text).mcpServers.reuse_assistant.env, { GITHUB_TOKEN: '${GITHUB_TOKEN:-}', GITLAB_TOKEN: '${GITLAB_TOKEN:-}' });
    if (name === 'opencode') assert.deepEqual(JSON.parse(text).mcp.reuse_assistant.environment, { GITHUB_TOKEN: '{env:GITHUB_TOKEN}', GITLAB_TOKEN: '{env:GITLAB_TOKEN}' });
    if (name === 'deepseek-harness') assert.match(text, /GITLAB_TOKEN: !!js process.env.GITLAB_TOKEN/);
  }
});

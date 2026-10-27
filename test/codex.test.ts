import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile, mkdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse } from 'smol-toml';
import { ReuseAssistant } from '../src/core.js';
import { evaluateHook } from '../src/codex-hook.js';
import { doctor, installCodex, uninstallCodex } from '../src/install.js';
import { fixture } from './support.js';
const exec = promisify(execFile);

test('Codex patch guard requires a current-turn decision and does not claim shell coverage', async t => {
  const root = await fixture(t);
  const assistant = new ReuseAssistant(root);
  const binding = { sessionId: 'session-1', turnId: 'turn-1' };
  const fields = { session_id: binding.sessionId, turn_id: binding.turnId };
  await evaluateHook(root, { hook_event_name: 'UserPromptSubmit', ...fields });
  const before = await evaluateHook(root, { hook_event_name: 'PreToolUse', tool_name: 'apply_patch', ...fields }) as any;
  assert.equal(before.hookSpecificOutput.permissionDecision, 'deny');
  const report = await assistant.check({ task: 'Use built-in parsing for a small fix', queries: ['parseArgs'], scope: 'local', binding });
  await assistant.decide({ checkId: report.id, choice: 'build_new', rationale: 'The built-in parser covers this simple fix without another dependency', status: 'planned' });
  assert.deepEqual(await evaluateHook(root, { hook_event_name: 'PreToolUse', tool_name: 'apply_patch', ...fields }), {});
  assert.deepEqual(await evaluateHook(root, { hook_event_name: 'PreToolUse', tool_name: 'Bash', ...fields }), {});
  const other = await evaluateHook(root, { hook_event_name: 'PreToolUse', tool_name: 'apply_patch', session_id: 'another-session', turn_id: 'turn-1' }) as any;
  assert.equal(other.hookSpecificOutput.permissionDecision, 'deny');
  await evaluateHook(root, { hook_event_name: 'UserPromptSubmit', session_id: 'session-1', turn_id: 'turn-2' });
  const stale = await evaluateHook(root, { hook_event_name: 'PreToolUse', tool_name: 'apply_patch', session_id: 'session-1', turn_id: 'turn-2' }) as any;
  assert.equal(stale.hookSpecificOutput.permissionDecision, 'deny');
  await assert.rejects(assistant.check({ task: 'Stale task', queries: ['parser'], scope: 'local', binding }), /stale/);
});

test('project initialization preserves other MCP and hook entries and is idempotent', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, '.codex'));
  await writeFile(path.join(root, '.codex/config.toml'), '# keep this comment\n[mcp_servers.other]\ncommand = "other-tool"\n');
  await writeFile(path.join(root, '.codex/hooks.json'), JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo original' }] }] } }));
  await installCodex(root, true);
  const first = await readFile(path.join(root, '.codex/config.toml'), 'utf8');
  await installCodex(root, true);
  assert.equal(await readFile(path.join(root, '.codex/config.toml'), 'utf8'), first);
  assert(first.includes('# keep this comment'));
  const config = parse(first) as any;
  assert.equal(config.mcp_servers.other.command, 'other-tool');
  assert.equal(config.mcp_servers.reuse_assistant.command, process.execPath);
  const hooks = JSON.parse(await readFile(path.join(root, '.codex/hooks.json'), 'utf8'));
  assert.equal(hooks.hooks.PreToolUse.length, 2);
  assert.equal(hooks.hooks.PreToolUse[0].hooks[0].command, 'echo original');
  const result = await doctor(root);
  assert.equal(result.serverConfigured, true);
  assert.equal(result.skillInstalled, true);
  assert.match(String(result.hooksTrusted), /unknown/);
  await uninstallCodex(root);
  const remaining = parse(await readFile(path.join(root, '.codex/config.toml'), 'utf8')) as any;
  assert.equal(remaining.mcp_servers.other.command, 'other-tool');
  assert.equal(remaining.mcp_servers.reuse_assistant, undefined);
  const remainingHooks = JSON.parse(await readFile(path.join(root, '.codex/hooks.json'), 'utf8'));
  assert.equal(remainingHooks.hooks.PreToolUse.length, 1);
  assert.equal(remainingHooks.hooks.PreToolUse[0].hooks[0].command, 'echo original');
});

test('generated hook launcher handles shell metacharacters and UTF-8 BOM input', async t => {
  const parent = await fixture(t);
  const root = path.join(parent, 'space $value & sample');
  await mkdir(root);
  await writeFile(path.join(root, 'package.json'), '{}');
  await installCodex(root, true);
  const hooks = JSON.parse(await readFile(path.join(root, '.codex/hooks.json'), 'utf8'));
  const command: string = hooks.hooks.UserPromptSubmit[0].hooks[0].command;
  const input = JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'test-session', turn_id: 'test-turn' });
  // Execute the exact generated command through the real platform shell.
  const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/sh';
  for (const transport of ['default', 'utf8-bom']) {
    // Windows PowerShell's UTF8 encoding emits a BOM on native pipelines.
    const prefix = transport === 'utf8-bom' ? '$OutputEncoding = [System.Text.Encoding]::UTF8; ' : '';
    const shellArgs = (script: string) => process.platform === 'win32' ? ['-NoProfile', '-Command', `${prefix}$input | ${script}`] : ['-c', script];
    const child = exec(shell, shellArgs(command), { timeout: 10000, maxBuffer: 1_000_000 });
    child.child.stdin?.end(process.platform !== 'win32' && transport === 'utf8-bom' ? '\uFEFF' + input : input);
    const { stdout, stderr } = await child;
    const response = JSON.parse(stdout.trim());
    if (response.hookSpecificOutput?.hookEventName !== 'UserPromptSubmit') {
      const probeCommand = `node -e "let b=[];process.stdin.on('data',c=>b.push(c));process.stdin.on('end',()=>console.log(Buffer.concat(b).subarray(0,32).toString('hex')))"`;
      const probe = exec(shell, shellArgs(probeCommand), { timeout: 10000 });
      probe.child.stdin?.end(input);
      console.error('[DEBUG-bom-ci]', transport, (await probe).stdout.trim());
    }
    assert.equal(response.hookSpecificOutput?.hookEventName, 'UserPromptSubmit', JSON.stringify({ transport, response, stderr }));
    assert.match(response.hookSpecificOutput.additionalContext, /test-session/);
  }
});

test('record storage refuses a symlink or junction outside the configured project', async t => {
  const parent = await fixture(t);
  const root = path.join(parent, 'project');
  const outside = path.join(parent, 'outside');
  await mkdir(root); await mkdir(outside);
  await symlink(outside, path.join(root, '.reuse-assistant'), process.platform === 'win32' ? 'junction' : 'dir');
  const assistant = new ReuseAssistant(root);
  await assert.rejects(assistant.check({ task: 'Check confined storage', queries: ['helper'], scope: 'local' }), /leaves/);
});

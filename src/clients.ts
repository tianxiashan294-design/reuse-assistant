import { lstat, mkdir, readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { cliPath, doctor, installCodex, uninstallCodex } from './install.js';
import { digest } from './project.js';
import { editJsonc, jsoncObject } from './jsonc.js';

export const CLIENTS = ['codex', 'claude-code', 'opencode', 'deepseek-harness'] as const;
export type AgentClient = typeof CLIENTS[number];
type NewClient = Exclude<AgentClient, 'codex'>;
interface Receipt {
  version: 1;
  config: string;
  server?: Record<string, unknown>;
  files: Record<string, string>;
  instruction: string;
}
const definitions = {
  'claude-code': { config: '.mcp.json', skill: '.claude/skills/reuse-first', instruction: 'CLAUDE.md', section: 'mcpServers' },
  opencode: { config: 'opencode.json', skill: '.opencode/skills/reuse-first', instruction: 'AGENTS.md', section: 'mcp' },
  'deepseek-harness': { config: '.dsh/reuse-assistant.cordis.patch.yml', skill: '.dsh/skills/reuse-first', instruction: 'AGENTS.md', section: '' },
} as const;

export function agentClient(value = 'codex'): AgentClient {
  if (!(CLIENTS as readonly string[]).includes(value)) throw new Error(`Unknown client ${value}; choose ${CLIENTS.join(', ')}.`);
  return value as AgentClient;
}

// Check each component before creating directories: a junction must not cause
// even an empty directory to be created outside the configured project.
async function target(root: string, relative: string, create = false): Promise<string> {
  let current = root;
  const parts = relative.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]!);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error(`Integration path leaves a regular project path: ${relative}`);
      if (i < parts.length - 1 && !info.isDirectory()) throw new Error(`Expected directory for ${relative}`);
      if (i === parts.length - 1 && !info.isFile()) throw new Error(`Expected regular file for ${relative}`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
      if (create && i < parts.length - 1) await mkdir(current);
    }
  }
  return current;
}
async function optional(root: string, relative: string): Promise<string | undefined> {
  try { return await readFile(await target(root, relative), 'utf8'); }
  catch (error: any) { if (error.code === 'ENOENT') return undefined; throw error; }
}
function object(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function configObject(text: string | undefined, file: string): Record<string, any> {
  let value: unknown;
  try { value = text === undefined ? {} : JSON.parse(text); }
  catch { throw new Error(`${file} is not valid JSON; left unchanged.`); }
  if (!object(value)) throw new Error(`${file} must contain a JSON object; left unchanged.`);
  return value;
}
const receiptFile = (client: NewClient) => `.reuse-assistant/integrations/${client}.json`;
const start = (client: NewClient) => `<!-- BEGIN reuse-assistant:${client} -->`;
const end = (client: NewClient) => `<!-- END reuse-assistant:${client} -->`;
function instructionBlock(text: string, client: NewClient): string | undefined {
  const from = text.indexOf(start(client));
  const to = text.indexOf(end(client));
  if (from === -1 && to === -1) return undefined;
  if (from === -1 || to < from || text.indexOf(start(client), from + 1) !== -1 || text.indexOf(end(client), to + 1) !== -1) {
    throw new Error('Malformed or duplicate managed instruction block; left unchanged.');
  }
  return text.slice(from, to + end(client).length);
}
function ownedPaths(client: NewClient): string[] {
  const def = definitions[client];
  return [`${def.skill}/SKILL.md`, `${def.skill}/references/local-cli.md`, `${def.skill}/references/alignment.md`, ...(client === 'deepseek-harness' ? [def.config] : [])];
}
async function receipt(root: string, client: NewClient): Promise<Receipt | undefined> {
  const text = await optional(root, receiptFile(client));
  if (text === undefined) return undefined;
  const value = configObject(text, receiptFile(client));
  const allowed = ownedPaths(client);
  const validConfig = value.config === definitions[client].config || (client === 'opencode' && value.config === 'opencode.jsonc');
  if (value.version !== 1 || !validConfig || !object(value.files) ||
      allowed.length !== Object.keys(value.files).length || allowed.some(p => typeof value.files[p] !== 'string') ||
      typeof value.instruction !== 'string' || (client !== 'deepseek-harness' && !object(value.server))) {
    throw new Error('Invalid integration receipt; left unchanged.');
  }
  return value as unknown as Receipt;
}
async function configFile(root: string, client: NewClient, saved?: Receipt): Promise<string> {
  if (client !== 'opencode') return definitions[client].config;
  const json = await optional(root, 'opencode.json');
  const jsonc = await optional(root, 'opencode.jsonc');
  if (json !== undefined && jsonc !== undefined) {
    throw new Error('Both opencode.json and opencode.jsonc exist; left unchanged. Keep one project config before automatic setup or removal.');
  }
  const present = jsonc !== undefined ? 'opencode.jsonc' : json !== undefined ? 'opencode.json' : undefined;
  if (saved && present && saved.config !== present) {
    throw new Error(`OpenCode config path differs from managed receipt (${saved.config}); left unchanged. Reconcile the owned config before retrying.`);
  }
  return present ?? saved?.config ?? definitions[client].config;
}
const readConfig = (text: string | undefined, file: string, client: NewClient) =>
  client === 'opencode' ? jsoncObject(text, file) : configObject(text, file);
function serverConfig(root: string, client: NewClient): Record<string, unknown> {
  const args = [cliPath, 'mcp', '--project', root];
  if (client === 'opencode') return { type: 'local', command: [process.execPath, ...args], enabled: true, timeout: 120000,
    environment: { GITHUB_TOKEN: '{env:GITHUB_TOKEN}', GITLAB_TOKEN: '{env:GITLAB_TOKEN}' } };
  return { type: 'stdio', command: process.execPath, args,
    env: { GITHUB_TOKEN: '${GITHUB_TOKEN:-}', GITLAB_TOKEN: '${GITLAB_TOKEN:-}' } };
}
function capability(client: NewClient) {
  return { client, mcp: 'stdio', patchGuard: 'not implemented for this client', shellWriteGuard: false, absoluteEnforcement: false,
    mcpRuntimeLoaded: 'not verified by filesystem inspection; verify all four tools in the host',
    workflow: 'MCP + skill + project instructions; agent follows the workflow voluntarily' };
}
function launch(root: string, client: NewClient): Record<string, unknown> {
  if (client === 'deepseek-harness') return {
    command: 'dsh', args: ['--profile', 'web', '--patch', path.join(root, definitions[client].config)],
    cwd: root, note: 'Launch a shipped profile with this explicit overlay; select this project as the session workspace. The overlay binds one server to this project for every session in that process. It is not auto-loaded and does not modify DSH_HOME.' };
  return { command: client === 'claude-code' ? 'claude' : 'opencode', args: [], cwd: root,
    note: 'Restart the client in this project, review host trust/permissions, and verify the four reuse_assistant MCP tools and reuse-first skill.' };
}

export async function installClient(project: string, client: AgentClient, hooks = false): Promise<Record<string, unknown>> {
  if (client === 'codex') return installCodex(project, hooks);
  if (hooks) throw new Error(`--hooks is currently supported only for codex; ${client} supports MCP, skill and project instructions.`);
  const root = await realpath(project);
  const def = definitions[client];
  const previous = await receipt(root, client);
  const configPath = await configFile(root, client, previous);
  const oldConfig = await optional(root, configPath);
  let config: Record<string, any> | undefined;
  const server = serverConfig(root, client);
  if (client !== 'deepseek-harness') {
    config = readConfig(oldConfig, configPath, client);
    if (config[def.section] !== undefined && !object(config[def.section])) throw new Error(`${def.section} must be an object; left unchanged.`);
    const existing = config[def.section]?.reuse_assistant;
    if (existing !== undefined && (!previous || !isDeepStrictEqual(existing, previous.server))) {
      throw new Error('An unmanaged or modified reuse_assistant server entry exists; left unchanged.');
    }
    config[def.section] = { ...config[def.section], reuse_assistant: server };
  }
  const files: Record<string, string> = {};
  files[`${def.skill}/SKILL.md`] = await readFile(new URL('../../skills/reuse-first/SKILL.md', import.meta.url), 'utf8');
  files[`${def.skill}/references/alignment.md`] = await readFile(new URL('../../skills/reuse-first/references/alignment.md', import.meta.url), 'utf8');
  files[`${def.skill}/references/local-cli.md`] = `# Local CLI fallback\n\n<!-- reuse-assistant-managed -->\n\nUse Node ${JSON.stringify(process.execPath)} with script ${JSON.stringify(cliPath)}. Pass --project ${JSON.stringify(root)} on check, inspect, assess, decide, report and doctor. Use --input <absolute-json-file> for structured arguments (or --input - for stdin). Run --help for syntax.\n\nMCP and CLI share evidence IDs and records. Use only a binding actually supplied by a compatible client hook. Follow [whole-task alignment](alignment.md) for substantive work.\n`;
  if (client === 'deepseek-harness') {
    // JSON-quoted scalar/array values are valid YAML. The only expressions are
    // fixed environment lookups; credentials are resolved by DSH at launch.
    files[def.config] = `# reuse-assistant-managed: explicit project MCP overlay\n- insert:\n    - id: reuse-assistant-mcp\n      name: '@deepseek-ai/dsh-mcp-client'\n      config:\n        serverName: reuse_assistant\n        transport: stdio\n        command: ${JSON.stringify(process.execPath)}\n        args: ${JSON.stringify([cliPath, 'mcp', '--project', root])}\n        cwd: ${JSON.stringify(root)}\n        toolCallTimeoutMs: 120000\n        env:\n          GITHUB_TOKEN: !!js process.env.GITHUB_TOKEN ?? ''\n          GITLAB_TOKEN: !!js process.env.GITLAB_TOKEN ?? ''\n`;
  }
  for (const [file] of Object.entries(files)) {
    const old = await optional(root, file);
    if (old !== undefined && (!previous || digest(old) !== previous.files[file])) throw new Error(`Unmanaged or modified ${file}; left unchanged.`);
  }
  const instructions = await optional(root, def.instruction) ?? '';
  const oldBlock = instructionBlock(instructions, client);
  if (oldBlock !== undefined && (!previous || digest(oldBlock) !== previous.instruction)) throw new Error('Unmanaged or modified reuse-assistant instructions; left unchanged.');
  const block = `${start(client)}\nBefore substantive feature work or a small fix, read ${def.skill}/SKILL.md and complete its reuse workflow. If MCP is disconnected, use the installed CLI reference beside that skill.\n${end(client)}`;
  const updatedInstructions = oldBlock ? instructions.replace(oldBlock, block) : `${instructions}${instructions && !instructions.endsWith('\n') ? '\n' : ''}${block}\n`;
  const ignore = await optional(root, '.gitignore') ?? '';
  const writes: Record<string, string> = { ...files, ...(config ? { [configPath]: client === 'opencode'
    ? editJsonc(oldConfig, configPath, [def.section, 'reuse_assistant'], server)
    : JSON.stringify(config, null, 2) + '\n' } : {}), [def.instruction]: updatedInstructions };
  if (!ignore.split(/\r?\n/).includes('.reuse-assistant/')) writes['.gitignore'] = `${ignore}${ignore && !ignore.endsWith('\n') ? '\n' : ''}.reuse-assistant/\n`;
  const nextReceipt: Receipt = { version: 1, config: configPath, ...(config ? { server } : {}), files: Object.fromEntries(Object.entries(files).map(([file, text]) => [file, digest(text)])), instruction: digest(block) };
  writes[receiptFile(client)] = JSON.stringify(nextReceipt, null, 2) + '\n';
  // Finish all validation before mutating any file. Receipts are written last;
  // filesystem failure mid-write is reported, never claimed to be transactional.
  for (const file of Object.keys(writes)) await target(root, file);
  for (const [file, text] of Object.entries(writes)) await writeFile(await target(root, file, true), text);
  return { project: root, client, mcpConfig: path.join(root, configPath), skill: path.join(root, def.skill, 'SKILL.md'), instructions: path.join(root, def.instruction), hooks: null, capability: capability(client), launch: launch(root, client) };
}

export async function doctorClient(project: string, client: AgentClient): Promise<Record<string, unknown>> {
  if (client === 'codex') return doctor(project);
  const root = await realpath(project);
  const def = definitions[client];
  const issues: string[] = [];
  let serverConfigured = false;
  let skillInstalled = false;
  let instructionsInstalled = false;
  try {
    const saved = await receipt(root, client);
    const configPath = await configFile(root, client, saved);
    const configText = await optional(root, configPath);
    if (client === 'deepseek-harness') serverConfigured = configText !== undefined && Boolean(saved && digest(configText) === saved.files[def.config]);
    else {
      const config = readConfig(configText, configPath, client);
      if (config[def.section] !== undefined && !object(config[def.section])) throw new Error(`${def.section} must be an object; left unchanged.`);
      serverConfigured = isDeepStrictEqual(config[def.section]?.reuse_assistant, serverConfig(root, client));
      if (config[def.section]?.reuse_assistant !== undefined && !serverConfigured) issues.push('MCP entry differs from the expected project launch command.');
    }
    const skill = await optional(root, `${def.skill}/SKILL.md`);
    skillInstalled = skill !== undefined && Boolean(saved && digest(skill) === saved.files[`${def.skill}/SKILL.md`]);
    const block = instructionBlock(await optional(root, def.instruction) ?? '', client);
    instructionsInstalled = block !== undefined && Boolean(saved && digest(block) === saved.instruction);
    if (!saved) issues.push('No managed integration receipt; run init or review manual configuration.');
    if (saved) for (const [file, hash] of Object.entries(saved.files)) {
      const text = await optional(root, file);
      if (text === undefined || digest(text) !== hash) issues.push(`Missing or modified generated file: ${file}`);
    }
  } catch (error) { issues.push(error instanceof Error ? error.message : 'Integration could not be inspected.'); }
  return { node: process.version, nodeSupported: Number(process.versions.node.split('.')[0]) >= 22, project: root, client,
    serverConfigured, skillInstalled, instructionsInstalled, hooksPresent: false, capability: capability(client), launch: launch(root, client),
    githubTokenPresent: Boolean(process.env.GITHUB_TOKEN), gitlabTokenPresent: Boolean(process.env.GITLAB_TOKEN), modelApiRequired: false, issues };
}

export async function uninstallClient(project: string, client: AgentClient): Promise<Record<string, unknown>> {
  if (client === 'codex') return uninstallCodex(project);
  const root = await realpath(project);
  const def = definitions[client];
  const saved = await receipt(root, client);
  if (!saved) return { project: root, client, changed: [], retained: [], note: 'No managed receipt; existing files left unchanged.' };
  const configPath = await configFile(root, client, saved);
  const changed: string[] = [];
  const retained: string[] = [];
  const writes: Record<string, string> = {};
  const removals: string[] = [];
  if (client !== 'deepseek-harness') {
    const text = await optional(root, configPath);
    if (text !== undefined) {
      const config = readConfig(text, configPath, client);
      if (config[def.section] !== undefined && !object(config[def.section])) throw new Error(`${def.section} must be an object; left unchanged.`);
      const existing = config[def.section]?.reuse_assistant;
      if (existing !== undefined) {
        if (isDeepStrictEqual(existing, saved.server)) {
          delete config[def.section].reuse_assistant;
          writes[configPath] = client === 'opencode' ? editJsonc(text, configPath, [def.section, 'reuse_assistant'], undefined) : JSON.stringify(config, null, 2) + '\n';
        } else retained.push(configPath);
      }
    }
  }
  for (const [file, hash] of Object.entries(saved.files)) {
    const text = await optional(root, file);
    if (text === undefined) continue;
    if (digest(text) === hash) removals.push(file); else retained.push(file);
  }
  const text = await optional(root, def.instruction) ?? '';
  const block = instructionBlock(text, client);
  if (block !== undefined) {
    if (digest(block) === saved.instruction) writes[def.instruction] = text.replace(block + (text.includes(block + '\n') ? '\n' : ''), '');
    else retained.push(def.instruction);
  }
  for (const file of [...Object.keys(writes), ...removals, receiptFile(client)]) await target(root, file);
  for (const [file, content] of Object.entries(writes)) { await writeFile(await target(root, file), content); changed.push(file); }
  for (const file of removals) { await unlink(await target(root, file)); changed.push(file); }
  if (!retained.length) { await unlink(await target(root, receiptFile(client))); changed.push(receiptFile(client)); }
  return { project: root, client, changed, retained, recordsRetained: '.reuse-assistant/',
    note: 'Only unchanged managed content was removed. Modified files and their receipt remain for review. Restart the host; omit the DeepSeek --patch overlay after removal.' };
}

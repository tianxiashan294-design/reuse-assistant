import { access, mkdir, readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'smol-toml';
import { confined } from './project.js';

const START = '# BEGIN reuse-assistant (generated)';
const END = '# END reuse-assistant (generated)';
const MARKER = 'Reuse Assistant: ';
export const cliPath = fileURLToPath(new URL('./cli.js', import.meta.url));
const hookPath = fileURLToPath(new URL('./codex-hook.js', import.meta.url));

async function optional(file: string): Promise<string> {
  try { return await readFile(file, 'utf8'); }
  catch (error: any) { if (error.code === 'ENOENT') return ''; throw error; }
}
async function writable(root: string, relative: string): Promise<string> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await confined(root, path.relative(root, path.dirname(target)));
  try { await confined(root, relative); }
  catch (error: any) { if (error.code !== 'ENOENT') throw error; }
  return target;
}
export async function installCodex(project: string, hooks: boolean): Promise<Record<string, unknown>> {
  const root = await realpath(project);
  const configFile = await writable(root, '.codex/config.toml');
  const old = await optional(configFile);
  parse(old);
  const stripped = old.replace(/\n?# BEGIN reuse-assistant \(generated\)[\s\S]*?# END reuse-assistant \(generated\)\n?/g, '');
  const parsed = parse(stripped) as any;
  if (parsed.mcp_servers?.reuse_assistant) throw new Error('An unmanaged mcp_servers.reuse_assistant entry exists. Choose a different server name or resolve it before installation.');
  const block = `${START}\n[mcp_servers.reuse_assistant]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ${JSON.stringify([cliPath, 'mcp', '--project', root])}\nenv_vars = ["GITHUB_TOKEN", "GITLAB_TOKEN"]\ntool_timeout_sec = 120\n${END}\n`;
  const config = `${stripped.trimEnd()}\n\n${block}`;
  parse(config);
  const skillFile = await writable(root, '.agents/skills/reuse-first/SKILL.md');
  const oldSkill = await optional(skillFile);
  if (oldSkill && !oldSkill.includes('<!-- reuse-assistant-managed -->')) throw new Error('An unmanaged reuse-first skill exists; installation leaves it unchanged.');
  const template = await readFile(new URL('../../skills/reuse-first/SKILL.md', import.meta.url), 'utf8');
  const referenceFile = await writable(root, '.agents/skills/reuse-first/references/local-cli.md');
  let hookConfig: any;
  let hookFile: string | undefined;
  if (hooks) {
    hookFile = await writable(root, '.codex/hooks.json');
    hookConfig = JSON.parse(await optional(hookFile) || '{}');
    hookConfig.hooks ??= {};
    const encodedModule = Buffer.from(pathToFileURL(hookPath).href).toString('base64');
    const encodedRoot = Buffer.from(root).toString('base64');
    // Only Base64 data enters this shell command; paths are decoded by Node.
    // This works in cmd/PowerShell/POSIX even with spaces or shell metacharacters
    // in the project path. MCP commands separately use argument arrays.
    const command = `node -e "import(Buffer.from('${encodedModule}','base64').toString()).then(m=>m.runHookEncoded('${encodedRoot}'))"`;
    for (const event of ['UserPromptSubmit', 'PreToolUse']) {
      const groups = hookConfig.hooks[event] ?? [];
      hookConfig.hooks[event] = groups.map((g: any) => ({ ...g, hooks: (g.hooks ?? []).filter((h: any) => !String(h.statusMessage ?? '').startsWith(MARKER)) })).filter((g: any) => g.hooks.length);
      hookConfig.hooks[event].push({ ...(event === 'PreToolUse' ? { matcher: '^(apply_patch|Edit|Write)$' } : {}), hooks: [{ type: 'command', command, timeout: 10, statusMessage: `${MARKER}${event === 'UserPromptSubmit' ? 'prepare turn' : 'check reuse decision'}` }] });
    }
  }
  await writeFile(configFile, config);
  await writeFile(skillFile, template);
  await writeFile(referenceFile, `# Local CLI fallback\n\nRun the installed CLI with Node. Use an input JSON file to avoid shell quoting problems.\n\n- Node executable: ${process.execPath}\n- CLI script: ${cliPath}\n- Project: ${root}\n\nCommands: check, inspect, decide, report, doctor. Use --input <absolute-json-file> --project <project> for tool arguments. Run --help for command syntax. The --project option binds every command to this project.\n\nMCP and CLI use the same check/evidence IDs and local records. Pass the hook-provided binding in check input when applicable.\n`);
  if (hookFile) await writeFile(hookFile, JSON.stringify(hookConfig, null, 2) + '\n');
  const ignoreFile = await writable(root, '.gitignore');
  const ignore = await optional(ignoreFile);
  if (!ignore.split(/\r?\n/).includes('.reuse-assistant/')) await writeFile(ignoreFile, `${ignore.trimEnd()}\n.reuse-assistant/\n`);
  return { project: root, mcpConfig: configFile, skill: skillFile, hooks: hookFile ?? null,
    next: hooks ? 'Open/trust this project in Codex, then start a new session. Review/trust the generated hook definitions in the host. Run doctor and verify actual hook coverage.' : 'Open/trust this project in Codex and start a new session to load the MCP server and skill.',
    capability: { client: 'codex', patchGuard: hooks ? 'configured; host trust and runtime verification required' : 'not configured', shellWriteGuard: false, absoluteEnforcement: false } };
}

export async function doctor(project: string): Promise<Record<string, unknown>> {
  const root = await realpath(project);
  const exists = async (relative: string) => { try { await access(await confined(root, relative)); return true; } catch { return false; } };
  let serverConfigured = false;
  const issues: string[] = [];
  try { serverConfigured = Boolean((parse(await optional(path.join(root, '.codex/config.toml'))) as any).mcp_servers?.reuse_assistant); }
  catch { issues.push('Project Codex TOML could not be parsed.'); }
  return { node: process.version, nodeSupported: Number(process.versions.node.split('.')[0]) >= 22, project: root,
    serverConfigured, skillInstalled: await exists('.agents/skills/reuse-first/SKILL.md'), hooksPresent: await exists('.codex/hooks.json'),
    projectTrust: 'host-managed: project-local config and hooks load only in trusted projects',
    mcpRuntimeLoaded: 'not verified by this filesystem check; test in a trusted client session',
    hooksTrusted: 'unknown: host-managed; must verify in a real session', guardedPaths: ['apply_patch / Edit / Write when configured and trusted'], unguardedPaths: ['shell writes', 'interactive write_stdin', 'other clients without an equivalent adapter'],
    githubTokenPresent: Boolean(process.env.GITHUB_TOKEN), gitlabTokenPresent: Boolean(process.env.GITLAB_TOKEN), modelApiRequired: false, issues };
}

export async function uninstallCodex(project: string): Promise<Record<string, unknown>> {
  const root = await realpath(project);
  const changed: string[] = [];
  const config = path.join(root, '.codex/config.toml');
  const old = await optional(config);
  const stripped = old.replace(/\n?# BEGIN reuse-assistant \(generated\)[\s\S]*?# END reuse-assistant \(generated\)\n?/g, '');
  if (old !== stripped) {
    await confined(root, '.codex/config.toml');
    parse(stripped);
    await writeFile(config, stripped);
    changed.push('.codex/config.toml');
  }
  const skill = '.agents/skills/reuse-first/SKILL.md';
  const skillText = await optional(path.join(root, skill));
  if (skillText.includes('<!-- reuse-assistant-managed -->')) {
    await unlink(await confined(root, skill));
    changed.push(skill);
    const reference = '.agents/skills/reuse-first/references/local-cli.md';
    if (await optional(path.join(root, reference))) { await unlink(await confined(root, reference)); changed.push(reference); }
  }
  const hooksPath = '.codex/hooks.json';
  const text = await optional(path.join(root, hooksPath));
  if (text) {
    const hooks = JSON.parse(text);
    let removed = false;
    for (const event of ['UserPromptSubmit', 'PreToolUse']) {
      if (!Array.isArray(hooks.hooks?.[event])) continue;
      hooks.hooks[event] = hooks.hooks[event].map((g: any) => ({ ...g, hooks: (g.hooks ?? []).filter((h: any) => {
        const ours = String(h.statusMessage ?? '').startsWith(MARKER);
        if (ours) removed = true;
        return !ours;
      }) })).filter((g: any) => g.hooks.length);
    }
    if (removed) {
      await confined(root, hooksPath);
      await writeFile(path.join(root, hooksPath), JSON.stringify(hooks, null, 2) + '\n');
      changed.push(hooksPath);
    }
  }
  return { project: root, changed, recordsRetained: '.reuse-assistant/', note: 'Only generated entries were removed. Existing records and their gitignore rule remain. Start a new client session.' };
}

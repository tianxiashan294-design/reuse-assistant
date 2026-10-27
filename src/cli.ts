#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReuseAssistant } from './core.js';
import { checkSchema, decisionSchema, inspectSchema, startMcp } from './server.js';
import { doctor, installCodex, uninstallCodex } from './install.js';
import { evaluateHook, readStdin } from './codex-hook.js';
import { markdown } from './format.js';

const HELP = `Reuse Assistant 0.1.0 — evidence-based reuse checks

  node dist/src/cli.js check --project PATH --task TEXT --query TERMS [--query TERMS] [--scope local|full] [--ecosystem auto|javascript|python] [--json]
  node dist/src/cli.js check --project PATH --input request.json
  node dist/src/cli.js inspect --project PATH --check ID --candidate ID [--path src/file.ts]
  node dist/src/cli.js decide --project PATH --input decision.json
  node dist/src/cli.js report --project PATH --check ID [--json]
  node dist/src/cli.js init --project PATH [--hooks]
  node dist/src/cli.js uninstall --project PATH
  node dist/src/cli.js doctor --project PATH
  node dist/src/cli.js mcp --project PATH

--input - reads JSON from stdin. Commands keep records in PROJECT/.reuse-assistant/.
No candidate code is executed. The host performs integration and validation.
init writes project-scoped Codex config and skill; --hooks adds a patch guard
requiring host trust. Shell writes are outside this guard's coverage.
`;

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    project: { type: 'string' }, input: { type: 'string' }, task: { type: 'string' }, query: { type: 'string', multiple: true },
    scope: { type: 'string' }, ecosystem: { type: 'string' }, check: { type: 'string' }, candidate: { type: 'string' },
    path: { type: 'string', multiple: true }, json: { type: 'boolean' }, hooks: { type: 'boolean' }, help: { type: 'boolean' },
    'no-cache': { type: 'boolean' }, budget: { type: 'string' }, package: { type: 'string', multiple: true },
  } });
  if (values.help || !positionals[0]) { process.stdout.write(HELP); return; }
  const command = positionals[0];
  const root = await realpath(path.resolve(values.project ?? process.cwd()));
  const assistant = new ReuseAssistant(root);
  const data = async () => JSON.parse(values.input === '-' ? await readStdin() : await readFile(path.resolve(values.input ?? ''), 'utf8'));
  const print = (value: unknown) => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
  if (command === 'mcp') { startMcp(assistant); return; }
  if (command === 'init') { print(await installCodex(root, Boolean(values.hooks))); return; }
  if (command === 'uninstall') { print(await uninstallCodex(root)); return; }
  if (command === 'doctor') { print(await doctor(root)); return; }
  if (command === 'hook') { print(await evaluateHook(root, JSON.parse(await readStdin()))); return; }
  if (command === 'check') {
    const input = checkSchema.parse(values.input ? await data() : { task: values.task, queries: values.query ?? [], scope: values.scope, ecosystem: values.ecosystem, packageNames: values.package, useCache: !values['no-cache'], ...(values.budget ? { budgetMs: Number(values.budget) } : {}) });
    const result = await assistant.check(input);
    if (values.json) print(result); else process.stdout.write(markdown(result));
    return;
  }
  if (command === 'inspect') {
    const input = inspectSchema.parse(values.input ? await data() : { checkId: values.check, candidateId: values.candidate, paths: values.path ?? [] });
    print(await assistant.inspect(input.checkId, input.candidateId, input.paths, input.budgetMs)); return;
  }
  if (command === 'decide') { print(await assistant.decide(decisionSchema.parse(await data()))); return; }
  if (command === 'report') {
    if (!values.check) throw new Error('Provide --check ID');
    const result = await assistant.store.check(values.check);
    if (!result) throw new Error('Unknown check');
    const decision = await assistant.store.latestDecision(result.id);
    if (values.json) print({ ...result, latestDecision: decision }); else process.stdout.write(markdown(result, decision));
    return;
  }
  throw new Error(`Unknown command ${command}; use --help`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : 'Command failed'); process.exitCode = 1; });
}

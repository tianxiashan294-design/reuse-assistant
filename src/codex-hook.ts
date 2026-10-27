import { realpath } from 'node:fs/promises';
import { Store } from './store.js';

export interface HookInput {
  hook_event_name: string;
  session_id?: string;
  turn_id?: string;
  cwd?: string;
  tool_name?: string;
}
export async function evaluateHook(root: string, input: HookInput): Promise<Record<string, unknown>> {
  const store = new Store(await realpath(root));
  const sessionId = input.session_id;
  const turnId = input.turn_id;
  if (input.hook_event_name === 'UserPromptSubmit') {
    if (!sessionId || !turnId) return { systemMessage: 'Reuse Assistant: client did not supply session/turn IDs; supported-path checking is unavailable.' };
    const binding = { sessionId, turnId };
    await store.saveGate({ binding, createdAt: new Date().toISOString() });
    return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: `Reuse Assistant binding: ${JSON.stringify(binding)}. Before a substantive implementation call check_reuse (full), inspect promising candidates, and record_decision (planned). For small fixes use local scope. Include this binding in check_reuse. Source outages may proceed only with an explicitly acknowledged incomplete decision. Discussion needs no check. Shell writes are outside the patch guard's coverage.` } };
  }
  if (input.hook_event_name !== 'PreToolUse' || !['apply_patch', 'Edit', 'Write'].includes(input.tool_name ?? '')) return {};
  const deny = (reason: string) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `Reuse Assistant: ${reason}` } });
  if (!sessionId || !turnId) return deny('Missing client binding. Diagnose the hook configuration; this guard cannot identify the current turn.');
  const gate = await store.gate(sessionId);
  if (!gate || gate.binding.turnId !== turnId || !gate.decisionId || !gate.checkId) return deny('Run check_reuse with the current binding, inspect relevant candidates, then record_decision before this patch. A small fix can use local scope.');
  const decision = await store.decision(gate.decisionId);
  const check = await store.check(gate.checkId);
  if (!decision || !check || decision.checkId !== check.id || decision.binding?.sessionId !== sessionId || decision.binding.turnId !== turnId || Date.now() - Date.parse(check.createdAt) > 6 * 60 * 60 * 1000) return deny('The check/decision is stale or inconsistent; run a fresh check.');
  return {};
}

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const b = Buffer.from(chunk);
    bytes += b.length;
    if (bytes > 1_000_000) throw new Error('Input exceeds 1 MB');
    chunks.push(b);
  }
  // PowerShell pipeline encoding layers can prepend repeated UTF-8 BOMs.
  return Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF+/, '');
}

export async function runHookEncoded(encoded: string): Promise<void> {
  try {
    const root = Buffer.from(encoded, 'base64').toString('utf8');
    const input = JSON.parse(await readStdin()) as HookInput;
    process.stdout.write(JSON.stringify(await evaluateHook(root, input)) + '\n');
  } catch {
    // Explicit supported denial, rather than an uncaught callback error that
    // Codex may treat as fail-open. The host still owns its timeout behavior.
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'Reuse Assistant hook could not read its local state. Run doctor or repair the project integration.' } }) + '\n');
  }
}

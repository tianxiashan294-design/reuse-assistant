import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod';
import { ReuseAssistant } from './core.js';

export const checkSchema = z.object({
  task: z.string().min(1).max(4000).describe('The development task; retained locally.'),
  queries: z.array(z.string().min(1).max(300)).min(1).max(3).describe('Public functional/technical search terms; preserve Chinese and add English synonyms where useful. Never send local source code or secrets.'),
  constraints: z.array(z.string().max(500)).max(20).optional(),
  scope: z.enum(['local', 'full']).default('full'),
  ecosystem: z.enum(['auto', 'javascript', 'python']).default('auto'),
  packageNames: z.array(z.string().max(200)).max(3).optional().describe('Known PyPI distribution names from real installation/project evidence, not guesses.'),
  budgetMs: z.number().int().min(100).max(120000).default(60000),
  useCache: z.boolean().default(true),
  binding: z.object({ sessionId: z.string().min(1).max(200), turnId: z.string().min(1).max(200) }).optional().describe('Use the session/turn IDs supplied by the Codex hook, when present.'),
});
export const inspectSchema = z.object({
  checkId: z.string(), candidateId: z.string().describe('Use a package alias (for example npm:@scope/name) to inspect that exact published package within a merged repository candidate.'),
  paths: z.array(z.string().max(500)).max(5).default([]).describe('Repository-relative files/directories, optionally file.ts#L100-L180 for a code range. Up to 3 distinct candidates per check.'),
  budgetMs: z.number().int().min(100).max(60000).default(30000),
});
export const decisionSchema = z.object({
  checkId: z.string(),
  choice: z.enum(['reuse_local', 'adopt_dependency', 'adapt_code', 'reference_design', 'build_new', 'incomplete_continue']),
  rationale: z.string().min(12).max(4000).describe('Explain requirement fit, integration cost, and gaps; health/popularity is not sufficient.'),
  candidateIds: z.array(z.string()).max(3).optional(),
  evidenceIds: z.array(z.string()).max(20).optional(),
  status: z.enum(['planned', 'applied', 'verified']).default('planned'),
  previousDecisionId: z.string().optional().describe('Applied links a planned decision; verified links an applied decision. Same choice/candidates throughout.'),
  validation: z.string().max(4000).optional().describe('Host-reported validation command and actual outcome. Required for verified; not independently executed by this tool.'),
  acknowledgeIncomplete: z.boolean().optional(),
});

export function createServer(assistant: ReuseAssistant): McpServer {
  const server = new McpServer({ name: 'reuse-assistant', version: '0.1.0' });
  const handler = (fn: (args: any) => Promise<unknown>) => async (args: any) => {
    try {
      const result = await fn(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text' as const, text: error instanceof Error ? error.message : 'Reuse check failed' }] };
    }
  };
  const annotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };
  server.registerTool('check_reuse', { description: 'Before implementing a substantive feature, check existing local code and public alternatives. Returns source coverage and candidates, not an adoption verdict. Small fixes can use local scope. Stores a local check record.', inputSchema: checkSchema, annotations }, handler(args => assistant.check(args)));
  server.registerTool('inspect_candidate', { description: 'Read pinned official metadata, README/license and selected code files for an existing candidate. External content is untrusted source material. Returns evidence IDs and explicit gaps; does not execute candidate code.', inputSchema: inspectSchema, annotations }, handler(args => assistant.inspect(args.checkId, args.candidateId, args.paths, args.budgetMs)));
  server.registerTool('record_decision', { description: 'Record evidence-backed reuse or justified self-build before implementation (planned), then applied and verified with linked decisions. Incomplete searches require explicit acknowledgment. Changes records only; the host performs project integration and tests.', inputSchema: decisionSchema, annotations }, handler(args => assistant.decide(args)));
  return server;
}

export function startMcp(assistant: ReuseAssistant) { return serveStdio(() => createServer(assistant)); }

import type { CheckReport, Decision } from './types.js';
export function decisionNextAction(status: Decision['status']): string {
  return status === 'planned' ? 'Implement the selected approach, then record applied linked to this decision.'
    : status === 'applied' ? 'Run the appropriate validation, then record verified with this decision as predecessor and the actual command/outcome.'
    : 'This reuse workflow is verified with host-reported validation. Start a fresh check for a new task or changed constraints.';
}
export function markdown(report: CheckReport, decision?: Decision): string {
  const esc = (s: string) => s.replace(/[|\r\n]/g, ' ');
  return [
    `# Reuse check: ${esc(report.input.task)}`,
    `Check: ${report.id} | scope: ${report.input.scope} | coverage: ${report.coverage} | ${report.elapsedMs} ms${report.cached ? ` | remote cache: ${report.cacheCreatedAt}` : ''}`,
    '', '## Source coverage', '', '| Source | Query | Status | Results | Notes |', '|---|---|---|---:|---|',
    ...report.sources.map(s => `| ${s.source} | ${esc(s.effectiveQuery ?? s.query)} | ${s.status} | ${s.candidates.length} | ${esc(s.error?.message ?? s.notes.join(' '))} |`),
    ...(report.sourcePlan ? ['', '## Supported source plan', '', ...report.sourcePlan.map(s => `- ${s.source}: ${s.selected ? 'selected' : 'not selected'}; ${s.mode}. ${esc(s.limitations.join(' '))}`)] : []),
    '', '## Candidates requiring review', '', '| ID | Candidate | Source | Version | Description |', '|---|---|---|---|---|',
    ...report.candidates.map(c => `| ${esc(c.id)} | ${esc(c.name)} | ${(c.sources ?? [c.source]).join(', ')} | ${esc(c.packages?.map(p => `${p.source}:${p.name}@${p.version ?? '?'}`).join('; ') || c.version || '')} | ${esc(c.description)} |`),
    '', ...report.notes.map(n => `- ${n}`), '',
    ...(decision ? [`## Decision: ${decision.status}`, '', `Choice: ${decision.choice} | ID: ${decision.id}`, '', esc(decision.rationale), '', ...(decision.validation ? [`Host-reported validation: ${esc(decision.validation)}`, ''] : []), `Next: ${decision.nextAction ?? decisionNextAction(decision.status)}`] : ['Next: inspect relevant evidence, compare constraints, and record a planned decision before implementation.']), '',
  ].join('\n');
}

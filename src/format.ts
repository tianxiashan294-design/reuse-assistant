import type { CheckReport, Decision, SourceResult } from './types.js';

function sourceNotes(source: SourceResult): string {
  const errorText = (error: NonNullable<SourceResult['error']>) => `${error.code}${error.status !== undefined ? ` HTTP ${error.status}` : ''} (${error.message})${error.endpoint ? `; endpoint=${error.endpoint}` : ''}${error.retryAfterMs !== undefined ? `; retryAfterMs=${error.retryAfterMs}` : ''}`;
  const pagination = source.pagination;
  return [
    ...(source.error ? [errorText(source.error)] : []),
    ...(source.endpoint ? [`Last successful endpoint=${source.endpoint}.`] : []),
    ...(source.catalogRevision ? [`Catalog commit=${source.catalogRevision}.`] : []),
    ...(source.failures ?? []).map(failure => `Failure page=${failure.page}: ${errorText(failure.error)}; retry=${failure.retry}${failure.retryError ? `; retry error=${errorText(failure.retryError)}` : ''}.`),
    ...(pagination ? [`${pagination.pagesFetched} pages / ${pagination.itemsFetched} items; ${pagination.stopReason}; hasMore=${pagination.hasMore}${pagination.mode ? `; mode=${pagination.mode}` : ''}${pagination.totalAvailable !== undefined ? `; reported total=${pagination.totalAvailable}` : ''}${pagination.failedPage ? `; failed page=${pagination.failedPage}` : ''}${pagination.next ? `; next=${pagination.next}` : ''}`] : []),
    ...source.notes,
  ].join(' ');
}
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
    ...(report.queryPlan ? ['', '## Query plan', '', ...report.queryPlan.map(q => `- ${q.kind}: ${esc(q.query)}; origin: ${esc(q.origin)}`)] : []),
    '', '## Source coverage', '', '| Source | Query | Status | Results | Notes |', '|---|---|---|---:|---|',
    ...report.sources.map(s => `| ${s.source} | ${esc(s.effectiveQuery ?? s.query)} | ${s.status} | ${s.candidates.length} | ${esc(sourceNotes(s))} |`),
    ...(report.sourcePlan ? ['', '## Supported source plan', '', ...report.sourcePlan.map(s => `- ${s.source}: ${s.selected ? 'selected' : 'not selected'}; ${s.mode}. ${esc(s.limitations.join(' '))}`)] : []),
    '', '## Candidates requiring review', '', '| ID | Candidate | Source | Version | Description |', '|---|---|---|---|---|',
    ...report.candidates.map(c => `| ${esc(c.id)} | ${esc(c.name)} | ${(c.sources ?? [c.source]).join(', ')} | ${esc(c.packages?.map(p => `${p.source}:${p.name}@${p.version ?? '?'}`).join('; ') || c.version || '')} | ${esc(c.description)} |`),
    '', ...report.notes.map(n => `- ${n}`), '',
    ...(report.alignmentPrompt ? ['## Whole-task alignment', '', report.alignmentPrompt, '',
      ...(report.alignments ?? []).flatMap(a => [`- ${a.id}: ${a.status}; coverage: ${a.coverage}; semantic judgment: ${a.judgment}`, ...a.blockers.map(b => `  - Blocker: ${esc(b)}`), ...a.gaps.map(g => `  - Gap: ${esc(g)}`)]), ''] : []),
    ...(decision ? [`## Decision: ${decision.status}`, '', `Choice: ${decision.choice} | ID: ${decision.id}`, '', esc(decision.rationale), '', ...(decision.validation ? [`Host-reported validation: ${esc(decision.validation)}`, ''] : []), `Next: ${decision.nextAction ?? decisionNextAction(decision.status)}`] : ['Next: inspect relevant evidence, compare constraints, and record a planned decision before implementation.']), '',
  ].join('\n');
}

import { SourceError } from './http.js';
import type { SearchPagination, SourceResult } from './types.js';

// Sources expose one bounded page. The core schedules rounds across all jobs,
// so a large source cannot consume continuation pages ahead of another's first.
export function pageProgress(page: number, pageSize: number, count: number, total?: unknown): SearchPagination {
  if (count > pageSize) throw new SourceError('invalid_response', 'Search page exceeds the requested or documented page size');
  const totalAvailable = typeof total === 'number' && Number.isSafeInteger(total) && total >= 0 ? total : undefined;
  const hasMore = count > 0 && (totalAvailable === undefined ? count >= pageSize : (page - 1) * pageSize + count < totalAvailable);
  return { mode: 'offset', pageSize, pagesFetched: 1, itemsFetched: count, totalAvailable, hasMore, stopReason: hasMore ? 'page_limit' : 'exhausted' };
}

export type SearchJob = (page: number, continuation?: string, attempt?: number) => Promise<SourceResult>;

function retryable(result: SourceResult): boolean {
  const error = result.error;
  // Do not replay ahead of a server-supplied delay. Short throttle handling
  // already belongs to Http; source-level retries never multiply it.
  if (!error || (error.retryAfterMs ?? 0) > 0) return false;
  return error.code === 'unavailable' || error.code === 'timeout' ||
    (error.code === 'http_error' && (error.status === 408 || (error.status !== undefined && error.status >= 500 && error.status <= 599)));
}

async function round(indices: number[], run: (index: number) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, indices.length) }, async () => {
    while (next < indices.length) await run(indices[next++]!);
  }));
}

export async function searchPages(jobs: SearchJob[], maxPages: number, signal: AbortSignal, maxRetries = 1): Promise<SourceResult[]> {
  const results: SourceResult[] = [];
  const visited = jobs.map(() => new Set<string>());
  for (let page = 1; page <= maxPages; page++) {
    const pending = jobs.map((_, i) => i).filter(i => page === 1 || (results[i]!.pagination?.hasMore && !results[i]!.error && results[i]!.pagination!.stopReason === 'page_limit'));
    const pages = new Map<number, SourceResult>();
    await round(pending, async i => {
      const previous = results[i];
      if (page > 1 && signal.aborted) {
        previous!.status = 'partial';
        previous!.error = { code: 'timeout', message: 'Request budget exhausted before the next page could start' };
        (previous!.failures ??= []).push({ page, error: { ...previous!.error }, retry: 'not_retried' });
        previous!.pagination!.stopReason = 'budget';
        previous!.pagination!.failedPage = page;
        return;
      }
      const continuation = page > 1 ? previous?.pagination?.next : undefined;
      if (continuation) {
        if (visited[i]!.has(continuation)) {
          previous!.status = 'partial';
          previous!.pagination!.stopReason = 'cursor_cycle';
          previous!.notes.push('Continuation URL was already read; stopped without claiming exhaustion.');
          return;
        }
        visited[i]!.add(continuation);
      }
      const current = await jobs[i]!(page, continuation, 0);
      if (current.error) (current.failures ??= []).push({ page, error: { ...current.error }, retry: 'not_retried' });
      pages.set(i, current);
    });
    // Every job gets its initial turn before any retry. Reuse the original
    // signal and worker bound, then aggregate this page only once.
    if (maxRetries > 0) await round(pending.filter(i => pages.has(i) && retryable(pages.get(i)!)), async i => {
      if (signal.aborted) return;
      const first = pages.get(i)!;
      const retried = await jobs[i]!(page, page > 1 ? results[i]?.pagination?.next : undefined, 1);
      const failure = first.failures![first.failures!.length - 1]!;
      failure.retry = retried.error ? 'failed' : 'recovered';
      if (retried.error) failure.retryError = { ...retried.error };
      retried.elapsedMs += first.elapsedMs;
      retried.notes = [...new Set([...first.notes, ...retried.notes])];
      retried.failures = [...first.failures!, ...(retried.failures ?? [])];
      pages.set(i, retried);
    });
    for (const [i, current] of pages) {
      const previous = results[i];
      if (!previous) {
        const seen = new Set<string>();
        current.candidates = current.candidates.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
        results[i] = current;
        continue;
      }
      const progress = previous.pagination!;
      previous.elapsedMs += current.elapsedMs;
      previous.notes = [...new Set([...previous.notes, ...current.notes])];
      previous.endpoint = current.endpoint ?? previous.endpoint;
      if (current.failures?.length) (previous.failures ??= []).push(...current.failures);
      if (current.error) {
        previous.status = 'partial';
        previous.error = current.error;
        progress.stopReason = signal.aborted ? 'budget' : 'error';
        progress.failedPage = page;
        continue;
      }
      const seen = new Set(previous.candidates.map(c => c.id));
      const added = current.candidates.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
      previous.candidates.push(...added);
      progress.pagesFetched += current.pagination!.pagesFetched;
      progress.itemsFetched += current.pagination!.itemsFetched;
      progress.totalAvailable = current.pagination!.totalAvailable ?? progress.totalAvailable;
      progress.hasMore = current.pagination!.hasMore;
      progress.stopReason = current.pagination!.stopReason;
      progress.mode = current.pagination!.mode ?? progress.mode;
      progress.next = current.pagination!.next;
      if (current.candidates.length && !added.length) {
        previous.status = 'partial';
        progress.hasMore = true;
        progress.stopReason = 'no_new_candidates';
        previous.notes.push('Continuation page contained no new candidate identities; stopped without claiming search exhaustion.');
      } else if (current.status === 'partial') previous.status = 'partial';
      else if (previous.status !== 'partial') previous.status = previous.candidates.length ? 'ok' : 'empty';
    }
  }
  return results;
}

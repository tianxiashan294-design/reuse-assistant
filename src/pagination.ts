import { SourceError } from './http.js';
import type { SearchPagination, SourceResult } from './types.js';

// Sources expose one bounded page. The core schedules rounds across all jobs,
// so a large source cannot consume continuation pages ahead of another's first.
export function pageProgress(page: number, pageSize: number, count: number, total?: unknown): SearchPagination {
  if (count > pageSize) throw new SourceError('invalid_response', 'Search page exceeds the requested or documented page size');
  const totalAvailable = typeof total === 'number' && Number.isSafeInteger(total) && total >= 0 ? total : undefined;
  const hasMore = count > 0 && (totalAvailable === undefined ? count >= pageSize : (page - 1) * pageSize + count < totalAvailable);
  return { pageSize, pagesFetched: 1, itemsFetched: count, totalAvailable, hasMore, stopReason: hasMore ? 'page_limit' : 'exhausted' };
}

export type SearchJob = (page: number) => Promise<SourceResult>;

export async function searchPages(jobs: SearchJob[], maxPages: number, signal: AbortSignal): Promise<SourceResult[]> {
  const results: SourceResult[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const pending = jobs.map((_, i) => i).filter(i => page === 1 || (results[i]!.pagination?.hasMore && !results[i]!.error && results[i]!.pagination!.stopReason === 'page_limit'));
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
      while (next < pending.length) {
        const i = pending[next++]!;
        const previous = results[i];
        if (page > 1 && signal.aborted) {
          previous!.status = 'partial';
          previous!.error = { code: 'timeout', message: 'Request budget exhausted before the next page could start' };
          previous!.pagination!.stopReason = 'budget';
          previous!.pagination!.failedPage = page;
          continue;
        }
        const current = await jobs[i]!(page);
        if (!previous) {
          const seen = new Set<string>();
          current.candidates = current.candidates.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
          results[i] = current;
          continue;
        }
        const progress = previous.pagination!;
        previous.elapsedMs += current.elapsedMs;
        previous.notes = [...new Set([...previous.notes, ...current.notes])];
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
        if (current.candidates.length && !added.length) {
          previous.status = 'partial';
          progress.hasMore = true;
          progress.stopReason = 'no_new_candidates';
          previous.notes.push('Continuation page contained no new candidate identities; stopped without claiming search exhaustion.');
        } else if (current.status === 'partial') previous.status = 'partial';
        else if (previous.status !== 'partial') previous.status = previous.candidates.length ? 'ok' : 'empty';
      }
    }));
  }
  return results;
}

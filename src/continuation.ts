import { SourceError } from './http.js';

export function gitlabPageUrl(value: string, query: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new SourceError('invalid_continuation', 'GitLab continuation is not an absolute URL'); }
  const expected = { search: query, visibility: 'public', per_page: '6', pagination: 'keyset', order_by: 'id', sort: 'asc' };
  const safeDefaults: Record<string, string> = { page: '1', simple: 'false', imported: 'false', include_hidden: 'false', membership: 'false', owned: 'false', repository_checksum_failed: 'false', starred: 'false', statistics: 'false', wiki_checksum_failed: 'false', with_custom_attributes: 'false', with_issues_enabled: 'false', with_merge_requests_enabled: 'false' };
  if (value.length > 4096 || url.protocol !== 'https:' || url.hostname !== 'gitlab.com' || url.port || url.username || url.password || url.hash || url.pathname !== '/api/v4/projects' ||
    [...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length !== 1) ||
    [...url.searchParams].some(([key, value]) => !Object.hasOwn(expected, key) && key !== 'id_after' && (!Object.hasOwn(safeDefaults, key) || safeDefaults[key] !== value)) ||
    Object.entries(expected).some(([key, expectedValue]) => url.searchParams.get(key) !== expectedValue) ||
    !/^[1-9]\d{0,19}$/.test(url.searchParams.get('id_after') ?? '')) {
    throw new SourceError('invalid_continuation', 'GitLab continuation violates the fixed public keyset query policy');
  }
  return url;
}

export function gitlabNext(header: string | null, current: URL, query: string): { next?: string; stop?: 'invalid_continuation' | 'cursor_cycle'; note?: string } {
  if (!header) return {};
  try {
    if (header.length > 16_384) throw new Error('Link header exceeds the parsing limit');
    const next: string[] = [];
    for (const part of header.split(/,(?=\s*<)/)) {
      const link = part.trim().match(/^<([^>]+)>\s*;(.*)$/);
      const rel = link?.[2]?.match(/(?:^|;)\s*rel\s*=\s*(?:"([^"]*)"|([^;\s]+))/i);
      if (!link || !rel) throw new Error('Malformed Link header');
      if ((rel[1] ?? rel[2] ?? '').split(/\s+/).includes('next')) next.push(link[1]!);
    }
    if (!next.length) return {};
    if (next.length !== 1) throw new Error('Ambiguous next links');
    const url = gitlabPageUrl(next[0]!, query);
    if (BigInt(url.searchParams.get('id_after')!) <= BigInt(current.searchParams.get('id_after') ?? '0')) {
      return { stop: 'cursor_cycle', note: 'GitLab next cursor did not advance; stopped without repeating a cursor or claiming exhaustion.' };
    }
    return { next: url.href };
  } catch {
    return { stop: 'invalid_continuation', note: 'GitLab next Link is malformed, ambiguous or outside the fixed public keyset query policy; current candidates remain available.' };
  }
}

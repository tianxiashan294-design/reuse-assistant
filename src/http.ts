// Error-aware requests and bounded aggregation adapt scout-mcp's network model.
// See THIRD_PARTY_NOTICES.md for the upstream revision and MIT notice.
import { setTimeout as delay } from 'node:timers/promises';

export class SourceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number,
    public retryAfterMs?: number,
  ) { super(message); }
}

export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new SourceError('timeout', 'Request budget exhausted'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new SourceError('timeout', 'Request budget exhausted'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export function retryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

const HOSTS = new Set(['api.github.com', 'registry.npmjs.org', 'pypi.org']);
export class Http {
  constructor(private fetcher: typeof fetch = fetch, private token = process.env.GITHUB_TOKEN) {}

  async json<T = any>(url: string, parent: AbortSignal, limit = 2_000_000): Promise<T> {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !HOSTS.has(target.hostname) || target.username || target.password || target.port) {
      throw new SourceError('invalid_url', 'Only supported public registry endpoints are readable');
    }
    const signal = AbortSignal.any([parent, AbortSignal.timeout(12_000)]);
    const headers: Record<string, string> = { 'User-Agent': 'reuse-assistant/0.1', Accept: 'application/json' };
    if (target.hostname === 'api.github.com') {
      headers.Accept = 'application/vnd.github+json';
      headers['X-GitHub-Api-Version'] = '2022-11-28';
      if (this.token) headers.Authorization = `Bearer ${this.token}`;
    }
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await abortable(this.fetcher(url, { headers, signal, redirect: 'error' }), signal);
        if (!response.ok) {
          const limited = response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0');
          let wait = retryAfter(response.headers.get('retry-after'));
          const reset = Number(response.headers.get('x-ratelimit-reset'));
          if (wait === undefined && limited && reset) wait = Math.max(0, reset * 1000 - Date.now());
          await response.body?.cancel();
          if (limited && attempt === 0 && wait !== undefined && wait <= 1500) {
            await delay(wait, undefined, { signal });
            continue;
          }
          throw new SourceError(limited ? 'rate_limited' : response.status === 404 ? 'not_found' : 'http_error',
            `${target.hostname} returned HTTP ${response.status}`, response.status, wait);
        }
        if (Number(response.headers.get('content-length')) > limit) {
          await response.body?.cancel();
          throw new SourceError('too_large', 'Registry response exceeds the byte limit');
        }
        const reader = response.body?.getReader();
        if (!reader) throw new SourceError('invalid_response', 'Empty registry response');
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const chunk = await abortable(reader.read(), signal);
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > limit) throw new SourceError('too_large', 'Registry response exceeds the byte limit');
            chunks.push(chunk.value);
          }
        } finally { await reader.cancel().catch(() => {}); }
        return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
      }
      throw new SourceError('unavailable', 'Registry request did not complete');
    } catch (error) {
      if (error instanceof SourceError) throw error;
      if (signal.aborted) throw new SourceError('timeout', 'Request budget exhausted');
      throw new SourceError('unavailable', error instanceof SyntaxError ? 'Invalid registry JSON' : 'Registry request failed');
    }
  }
}

import { ReuseAssistant } from '../src/core.js';
import { Http } from '../src/http.js';
import { startMcp } from '../src/server.js';
import { fakeFetch, json } from './support.js';
import { pagedResponse } from './pagination-support.js';

const attempts = new Map<string, number>();
startMcp(new ReuseAssistant(process.argv[2]!, new Http(fakeFetch(url => {
  const attempt = (attempts.get(url.href) ?? 0) + 1;
  attempts.set(url.href, attempt);
  return attempt === 1 ? json({}, 503) : pagedResponse(url);
}), '', '')));

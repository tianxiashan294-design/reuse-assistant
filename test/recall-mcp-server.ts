import { ReuseAssistant } from '../src/core.js';
import { Http } from '../src/http.js';
import { startMcp } from '../src/server.js';
import { fakeFetch } from './support.js';
import { recallResponse } from './recall-support.js';
startMcp(new ReuseAssistant(process.argv[2]!, new Http(fakeFetch(url => recallResponse(url)), '', '')));

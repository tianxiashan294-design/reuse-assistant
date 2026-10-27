import { ReuseAssistant } from '../src/core.js';
import { Http } from '../src/http.js';
import { startMcp } from '../src/server.js';
import { v2Fetch } from './v2-support.js';

// Real stdio server and public schemas, deterministic public endpoint fixtures.
startMcp(new ReuseAssistant(process.argv[2]!, new Http(v2Fetch(), '', '')));

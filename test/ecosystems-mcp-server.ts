import { ReuseAssistant } from '../src/core.js';
import { Http } from '../src/http.js';
import { startMcp } from '../src/server.js';
import { ecosystemsFetch } from './ecosystems-support.js';
startMcp(new ReuseAssistant(process.argv[2]!,new Http(ecosystemsFetch(), '', '')));

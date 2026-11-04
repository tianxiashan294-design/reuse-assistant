import { ReuseAssistant } from '../src/core.js';
import { Http } from '../src/http.js';
import { startMcp } from '../src/server.js';
import { v7Fetch } from './v7-support.js';
startMcp(new ReuseAssistant(process.argv[2]!, new Http(v7Fetch(), 'fixture-github-token', 'fixture-gitlab-token')));

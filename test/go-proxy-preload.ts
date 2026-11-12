import { goProxyResponse } from './go-proxy-support.js';
import { fakeFetch } from './support.js';

globalThis.fetch = fakeFetch(goProxyResponse);

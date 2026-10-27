import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ReuseAssistant } from '../src/core.js';

// Live endpoint observations, deliberately separate from the deterministic suite.
const assistant = new ReuseAssistant(process.cwd());
const startedAt = new Date().toISOString();
const sdk = await assistant.check({ task: 'Validate the existing official MCP server integration', queries: ['modelcontextprotocol typescript SDK', '@modelcontextprotocol/server'], constraints: ['Node 22+', 'local stdio', 'official SDK'], scope: 'full', ecosystem: 'javascript', useCache: false });
const sdkCandidate = sdk.candidates.find(c => c.aliases?.includes('npm:@modelcontextprotocol/server'));
const sdkEvidence = sdkCandidate ? await assistant.inspect(sdk.id, 'npm:@modelcontextprotocol/server', ['packages/server/src/server/mcp.ts#L1100-L1180']) : undefined;
const python = await assistant.check({ task: 'Find Python in-process background scheduling alternatives', queries: ['python in-process task scheduling'], ecosystem: 'python', scope: 'full', packageNames: ['APScheduler'], useCache: false });
const pythonCandidate = python.candidates.find(c => c.aliases?.some(id => id.toLowerCase() === 'pypi:apscheduler'));
const pythonEvidence = pythonCandidate ? await assistant.inspect(python.id, pythonCandidate.aliases!.find(id => id.toLowerCase() === 'pypi:apscheduler')!, ['pyproject.toml']) : undefined;
const summarize = (r: typeof sdk) => ({ id: r.id, elapsedMs: r.elapsedMs, coverage: r.coverage, sources: r.sources.map(s => ({ source: s.source, query: s.query, status: s.status, count: s.candidates.length, error: s.error, notes: s.notes })), candidates: r.candidates.filter(c => c.source !== 'local').map(c => ({ id: c.id, name: c.name, packages: c.packages })) });
const summarizeInspection = (i: typeof sdkEvidence) => i ? { id: i.id, status: i.status, metadata: i.metadata, errors: i.errors, files: i.files.map(f => ({ path: f.path, ref: f.ref, url: f.url, startLine: f.startLine, endLine: f.endLine, truncated: f.truncated })) } : null;
const result = { startedAt, node: process.version, sdk: summarize(sdk), sdkEvidence: summarizeInspection(sdkEvidence), python: summarize(python), pythonEvidence: summarizeInspection(pythonEvidence), note: 'Live endpoint observations only. Coverage is bounded and network-dependent; this is not an ecosystem recall benchmark or proof of real-client hook activation.' };
await mkdir(path.resolve('docs'), { recursive: true });
await writeFile(path.resolve('docs/live-smoke.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ sdk: result.sdk.sources.map(s => `${s.source}:${s.status}`), python: result.python.sources.map(s => `${s.source}:${s.status}`), sdkInspection: sdkEvidence?.status, pythonInspection: pythonEvidence?.status, report: 'docs/live-smoke.json' }, null, 2));
if (!sdkCandidate || !pythonCandidate) process.exitCode = 1;

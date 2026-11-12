import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { ReuseAssistant } from '../src/core.js';
import { Http } from '../src/http.js';
import type { CheckInput } from '../src/types.js';
import { fixture, fakeFetch, json } from './support.js';
import { scenarios, recallResponse } from './recall-support.js';
const base: CheckInput = {task:'Recall fixture',queries:[scenarios.crossLanguage.query],sources:['npm'],maxPages:1,useCache:false};
const variants = [{query:scenarios.crossLanguage.query,variants:[scenarios.crossLanguage.english]}];

test('host variants recover English-only local/remote hits, preserve mapping and deduplicate execution', async t => {
  const root = await fixture(t), seen: string[] = [];
  await writeFile(`${root}/english-only.ts`, 'export const work = "background scheduler";');
  const core = new ReuseAssistant(root, new Http(fakeFetch(url => {seen.push(url.searchParams.get('text')!);return recallResponse(url);}), '', ''));
  const original = await core.check(base);
  assert(!original.candidates.some(c => c.id === `npm:${scenarios.crossLanguage.target}` || c.localPath === 'english-only.ts'));
  const expanded = await core.check({...base,queryVariants:variants});
  assert(expanded.candidates.some(c => c.id === `npm:${scenarios.crossLanguage.target}`));
  assert(expanded.candidates.some(c => c.localPath === 'english-only.ts'));
  assert.deepEqual(expanded.input.queries, base.queries);
  seen.length = 0;
  const dedup = await core.check({...base,queries:scenarios.dedup.queries,queryVariants:scenarios.dedup.queryVariants});
  assert.deepEqual(seen,scenarios.dedup.executed);
  assert.deepEqual(dedup.queryPlan,[
    {query:'定时任务',origin:'定时任务',kind:'original'}, {query:'scheduler',origin:'scheduler',kind:'original'},
    {query:'scheduler',origin:'定时任务',kind:'variant'}, {query:'background scheduler',origin:'定时任务',kind:'variant'},
    {query:'background scheduler',origin:'scheduler',kind:'variant'}
  ]);
  seen.length = 0;
  const repeated = await core.check({...base,queryVariants:[{query:base.queries[0]!,variants:[scenarios.crossLanguage.english,` ${scenarios.crossLanguage.english} `]}]});
  assert.equal(repeated.queryPlan?.length,3);
  assert.deepEqual(seen,[base.queries[0],scenarios.crossLanguage.english]);
  const outage = await new ReuseAssistant(root,new Http(fakeFetch(url=>url.hostname==='api.github.com'?json({},scenarios.outage.status):recallResponse(url)), '', '')).check({...base,sources:['github','npm'],queryVariants:variants});
  assert(outage.candidates.some(c=>c.id===`npm:${scenarios.crossLanguage.target}`));
  assert.equal(outage.sources.find(s=>s.source===scenarios.outage.source)?.failures?.[0]?.retry,'failed');
  assert.equal(outage.coverage,'partial');
});

test('variant policy isolates caches and invalid anchors/bounds fail before remote work', async t => {
  let calls = 0;
  const core = new ReuseAssistant(await fixture(t),new Http(fakeFetch(url=>{calls++;return recallResponse(url);}), '', ''));
  const original = await core.check({...base,useCache:true});
  const expanded = await core.check({...base,useCache:true,queryVariants:variants});
  assert.notEqual(original.contextHash,expanded.contextHash);
  assert.equal(expanded.cached,false);
  assert.equal((await core.check({...base,useCache:true,queryVariants:variants})).cached,true);
  assert.equal((await core.check({...base,useCache:true})).cached,true);
  assert.equal(calls,3);
  const before = calls;
  for (const queryVariants of [
    [{query:'absent',variants:['valid']}], [{query:base.queries[0]!,variants:[' ']}],
    [{query:base.queries[0]!,variants:['a','b','c']}], [{query:base.queries[0]!,variants:['x'.repeat(301)]}],
    [variants[0]!,{...variants[0]!,query:` ${variants[0]!.query} `}]
  ]) await assert.rejects(core.check({...base,queryVariants}));
  assert.equal(calls,before);
});

test('skewed sources share shortlist slots, credit merged packages and retain lexical ranking and caps', async t => {
  const root = await fixture(t), scenario = scenarios.fairness;
  await Promise.all(Array.from({length:scenario.localCount},(_,i)=>writeFile(`${root}/local-${i}.ts`,scenario.query)));
  const report = await new ReuseAssistant(root,new Http(fakeFetch(url=>recallResponse(url)), '', '')).check({...base,queries:[scenario.query],sources:['rubygems','npm','github'],maxPages:3});
  assert.equal(report.candidates.length,30);
  assert.equal(report.candidates.filter(c=>c.source==='local').length,8);
  const remote = report.candidates.filter(c=>c.source!=='local');
  const shared = remote[0]!;
  assert(shared.aliases?.includes('github:example/shared'));
  assert.deepEqual([...shared.sources!].sort(),['github','npm']);
  assert.equal(shared.packages?.length,2);
  assert.equal(remote[1]!.name,'fairness-rubygems-17');
  const counts = ['github','npm','rubygems'].map(source=>remote.filter(c=>c.sources?.includes(source as any)).length);
  assert(Math.max(...counts)-Math.min(...counts)<=1,JSON.stringify(counts));
  assert(report.sources.find(s=>s.source==='rubygems')!.candidates.length>report.sources.find(s=>s.source==='github')!.candidates.length);
});

test('CLI input JSON and real MCP stdio accept host variants and return the shared plan', async t => {
  const root = await fixture(t), input = `${root}/request.json`;
  await writeFile(input,JSON.stringify({...base,scope:'local',queryVariants:variants}));
  const cli = fileURLToPath(new URL('../src/cli.js',import.meta.url));
  const {stdout} = await promisify(execFile)(process.execPath,[cli,'check','--project',root,'--input',input,'--json']);
  assert.equal(JSON.parse(stdout).queryPlan[1].query,scenarios.crossLanguage.english);
  const client = new Client({name:'recall-acceptance',version:'1.0.0'});
  t.after(async()=>{await client.close();});
  await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./recall-mcp-server.js',import.meta.url)),root],stderr:'pipe'}));
  const listing = await client.listTools();
  assert.equal((listing.tools.find(s=>s.name==='check_reuse')!.inputSchema.properties as any).queryVariants.maxItems,3);
  const result: any = await client.callTool({name:'check_reuse',arguments:{...base,queryVariants:variants}});
  assert.notEqual(result.isError,true,result.content?.[0]?.text);
  const report = JSON.parse(result.content[0].text);
  assert.equal(report.queryPlan[1].origin,scenarios.crossLanguage.query);
  assert(report.candidates.some((c:any)=>c.id===`npm:${scenarios.crossLanguage.target}`));
  const bad: any = await client.callTool({name:'check_reuse',arguments:{...base,queryVariants:[{query:'absent',variants:['valid']} ]}});
  assert.equal(bad.isError,true);
});

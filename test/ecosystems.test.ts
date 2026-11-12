import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { ReuseAssistant } from '../src/core.js';
import { Http } from '../src/http.js';
import type { CheckInput } from '../src/types.js';
import { fixture, fakeFetch, json } from './support.js';
import { CABAL,POM,RELEASE,sha,ecosystemsResponse,type EcosystemOptions } from './ecosystems-support.js';
const input:CheckInput={task:'Find scheduler',queries:['scheduler'],maxPages:3,useCache:false};

test('Clojars pages 24+1 results and reads only supported fixed plain POM identities',async t=>{
  const seen:URL[]=[],options:EcosystemOptions={};
  const core=new ReuseAssistant(await fixture(t),new Http(fakeFetch(url=>{seen.push(url);return ecosystemsResponse(url,options)!;}), '', ''));
  const report=await core.check({...input,sources:['clojars']}),source=report.sources.find(s=>s.source==='clojars')!;
  assert.equal(source.candidates.length,25);assert.equal(source.pagination?.pageSize,24);assert.equal(source.pagination?.pagesFetched,2);
  assert.deepEqual(seen.map(url=>url.searchParams.get('page')),['1','2']);assert(seen.every(url=>url.searchParams.get('q')==='scheduler'&&url.searchParams.get('format')==='json'));
  const id='clojars:fixture/scheduler-0',e=await core.inspect(report.id,id);
  assert.equal((e.metadata.registry as any).version,'1.0.0');assert.equal(e.status,'partial');
  assert(e.files.some(f=>f.url.endsWith('/fixture/scheduler-0/1.0.0/scheduler-0-1.0.0.pom')&&f.ref==='1.0.0'));
  const inherited='<project><parent><groupId>fixture</groupId><artifactId>scheduler-0</artifactId><version>1.0.0</version></parent><artifactId>scheduler-0</artifactId></project>';
  for(const pom of [
    '<!DOCTYPE project [<!ENTITY name "fixture">]>'+POM,
    POM.replace('fixture','&name;'),POM.replace('fixture','<![CDATA[fixture]]>'),
    POM.replace('<project>','<x:project xmlns:x="urn:fixture">').replace('</project>','</x:project>'),
    POM.replace('1.0.0','${revision}'),inherited,
    POM.replace('<groupId>fixture</groupId>','<groupId>wrong</groupId>')
  ]){options.pom=pom;const bad=await core.inspect(report.id,id);assert.equal(bad.status,'partial');assert(bad.errors.length>0);}
  options.pom=POM;options.snapshot=true;
  const snap=await core.check({...input,sources:['clojars'],maxPages:1}),before=seen.length;
  const unsupported=await core.inspect(snap.id,id);assert.match(unsupported.errors.join(' '),/SNAPSHOT/);assert.equal(seen.length,before);
});

test('Hackage searches once per query, slices locally and pins numeric normal version plus hashed Cabal revision',async t=>{
  const seen:URL[]=[],options:EcosystemOptions={};
  const core=new ReuseAssistant(await fixture(t),new Http(fakeFetch(url=>{seen.push(url);return ecosystemsResponse(url,options)!;}), '', ''));
  const report=await core.check({...input,queries:['scheduler','queue'],sources:['hackage']});
  assert.equal(seen.length,2);assert.deepEqual(seen.map(url=>url.searchParams.get('terms')),['scheduler','queue']);
  assert(report.sources.filter(s=>s.source==='hackage').every(s=>s.candidates.length===13&&s.pagination?.pagesFetched===3&&s.pagination.mode==='local'));
  assert(report.candidates.every(c=>c.version===undefined));
  const e=await core.inspect(report.id,'hackage:3d-fixture-p0');assert.equal((e.metadata.registry as any).version,'10.0');
  const cabal=e.files.find(f=>f.path==='PUBLISHED.cabal')!;
  assert.equal(cabal.ref,'10.0/revision/3');assert.equal(cabal.sha256,sha(CABAL));assert(cabal.url.endsWith('/package/3d-fixture-p0-10.0/revision/3.cabal'));
  options.hash='0'.repeat(64);const hashBad=await core.inspect(report.id,'hackage:3d-fixture-p0');assert.match(hashBad.errors.join(' '),/hash|checksum|digest|SHA/i);
  options.hash=undefined;options.cabal=CABAL.replace('name: 3d-fixture-p0','name: wrong');
  const identityBad=await core.inspect(report.id,'hackage:3d-fixture-p0');assert(identityBad.errors.length>0);
  for(const count of [401,801]){options.count=count;const r=await core.check({...input,sources:['hackage'],maxPages:1});const s=r.sources.find(s=>s.source==='hackage')!;assert.notEqual(s.status,'ok');if(count===801)assert.equal(s.error?.code,'too_large');else assert.equal(s.status,'partial');}
});

test('Hackage preserves candidate-pool saturation after deduplication', async t => {
  const rows = Array.from({ length: 400 }, () => ({ name: 'fixture' }));
  const core = new ReuseAssistant(await fixture(t), new Http(fakeFetch(() => json(rows)), '', ''));
  const report = await core.check({ ...input, sources: ['hackage'] });
  const source = report.sources.find(result => result.source === 'hackage');
  assert.equal(source?.status, 'partial');
  assert.deepEqual(source?.candidates.map(candidate => candidate.name), ['fixture']);
  assert.equal(source?.pagination?.totalAvailable, 1);
  assert.equal(source?.pagination?.pagesFetched, 1);
});

test('MetaCPAN escapes filters, pages releases, exposes incomplete upstream results and validates fixed release identity',async t=>{
  const seen:URL[]=[],options:EcosystemOptions={};
  const core=new ReuseAssistant(await fixture(t),new Http(fakeFetch(url=>{seen.push(url);return ecosystemsResponse(url,options)!;}), '', ''));
  const report=await core.check({...input,queries:['scheduler" OR status:backpan'],sources:['metacpan'],maxPages:2});
  const q=seen[0]!.searchParams.get('q')!;assert(q.includes('status:latest')&&q.includes('authorized:true')&&q.includes('maturity:released'));assert(!q.includes('scheduler" OR status:backpan'));
  assert.deepEqual(seen.map(url=>url.searchParams.get('from')),['0','6']);assert(seen.every(url=>url.searchParams.get('size')==='6'));
  const selected=report.candidates.find(c=>c.id==='metacpan:Schedule-Tools-0')!;
  assert(selected.packages?.[0]?.metadataUrl?.endsWith('/v1/release/FIXTURE/Actual-Release-0-v1.0'));
  const e=await core.inspect(report.id,selected.id);assert.equal((e.metadata.registry as any).version,'1.0');assert.equal(e.status,'partial');
  assert(e.files.some(f=>f.url.endsWith('/v1/release/FIXTURE/Actual-Release-0-v1.0')));
  options.release={...RELEASE,distribution:'Impostor'};assert((await core.inspect(report.id,selected.id)).errors.length>0);options.release=undefined;
  for(const flags of [{timedOut:true},{failedShards:1}]){Object.assign(options,{timedOut:false,failedShards:0},flags);const r=await core.check({...input,sources:['metacpan'],maxPages:1});const s=r.sources.find(s=>s.source==='metacpan')!;assert.equal(s.status,'partial');assert.equal(s.candidates.length,6);}
});

test('mixed new-source failures preserve healthy results, structured errors and explicit incomplete decisions',async t=>{
  const core=new ReuseAssistant(await fixture(t),new Http(fakeFetch(url=>url.hostname==='clojars.org'?json({},429,{'retry-after':'60'}):url.hostname.endsWith('metacpan.org')?json({bad:true}):ecosystemsResponse(url)!), '', ''));
  const report=await core.check({...input,sources:['clojars','hackage','metacpan'],maxPages:1});
  assert.equal(report.coverage,'partial');assert(report.candidates.some(c=>c.source==='hackage'));
  assert.equal(report.sources.find(s=>s.source==='clojars')?.error?.code,'rate_limited');assert.equal(report.sources.find(s=>s.source==='metacpan')?.error?.code,'invalid_response');
  await assert.rejects(core.decide({checkId:report.id,choice:'build_new',status:'planned',rationale:'Fixtures preserve source failures instead of claiming no alternatives'}),/Acknowledge/);
});

test('new ecosystems route through core, isolate cached source plans and keep local checks offline',async t=>{
  let calls=0;const core=new ReuseAssistant(await fixture(t),new Http(fakeFetch(url=>{calls++;return ecosystemsResponse(url)!;}), '', ''));
  for(const [ecosystem,source]of [['clojure','clojars'],['haskell','hackage'],['perl','metacpan']] as const){
    const request={...input,ecosystem,maxPages:1,useCache:true},r=await core.check(request),before=calls;
    assert.deepEqual(r.sources.slice(1).map(s=>s.source),['github','gitlab',source]);assert.equal((await core.check(request)).cached,true);assert.equal(calls,before);
  }
  const overridden=await core.check({...input,ecosystem:'clojure',sources:['hackage'],maxPages:1});assert.deepEqual(overridden.sources.slice(1).map(s=>s.source),['hackage']);
  const before=calls;await core.check({...input,ecosystem:'perl',scope:'local'});assert.equal(calls,before);
});

test('CLI and real MCP expose metadata ecosystems and acknowledgment of uninspected code',async t=>{
  const root=await fixture(t),cli=fileURLToPath(new URL('../src/cli.js',import.meta.url));
  const {stdout}=await promisify(execFile)(process.execPath,[cli,'check','--project',root,'--task','Ecosystem input','--query','scheduler','--ecosystem','haskell','--source','hackage','--scope','local','--json']);assert.equal(JSON.parse(stdout).input.ecosystem,'haskell');
  const client=new Client({name:'ecosystem-acceptance',version:'1.0.0'});t.after(async()=>{await client.close();});
  await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./ecosystems-mcp-server.js',import.meta.url)),root],stderr:'pipe'}));
  const call=async(name:string,args:object)=>{const r:any=await client.callTool({name,arguments:{...args}});assert.notEqual(r.isError,true,r.content?.[0]?.text);return JSON.parse(r.content[0].text);};
  const r=await call('check_reuse',{...input,sources:['clojars','hackage','metacpan'],maxPages:1}),evidence:string[]=[];
  const ids=['clojars:fixture/scheduler-0','hackage:3d-fixture-p0','metacpan:Schedule-Tools-0'];
  for(const candidateId of ids){const e=await call('inspect_candidate',{checkId:r.id,candidateId});assert.equal(e.status,'partial');assert(e.files.length>0);evidence.push(e.id);}
  const choice={checkId:r.id,choice:'adopt_dependency',status:'planned',candidateIds:ids,evidenceIds:evidence,rationale:'Fixed metadata evidence is available; archive code and repository correspondence remain explicitly unverified'};
  const denied:any=await client.callTool({name:'record_decision',arguments:choice});assert.equal(denied.isError,true);
  assert.equal((await call('record_decision',{...choice,acknowledgeIncomplete:true})).status,'planned');
});

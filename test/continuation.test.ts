import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { ReuseAssistant } from '../src/core.js';
import { Http } from '../src/http.js';
import type { CheckInput } from '../src/types.js';
import { fixture, fakeFetch, json } from './support.js';
import { pagedResponse, searchPage } from './pagination-support.js';
const request: CheckInput = {task:'Bounded continuations',queries:['scheduler target'],sources:['gitlab'],maxPages:3,useCache:false};
const primary='https://azuresearch-usnc.nuget.org/query', secondary='https://azuresearch-ussc.nuget.org/query';
const index = () => json({resources:[
  {'@type':'SearchQueryService/3.0.0-beta','@id':primary},
  {'@type':'SearchQueryService/3.0.0-rc','@id':primary},
  {'@type':'SearchQueryService/3.5.0','@id':secondary}
]});

test('GitLab keyset preserves query/defaults, follows Link and retries the same cursor URL', async t => {
  const seen: URL[]=[];
  let failed=false;
  const core=new ReuseAssistant(await fixture(t),new Http(fakeFetch(url=>{
    seen.push(url);
    if(searchPage(url)===2&&!failed){failed=true;return json({},503);}
    const response=pagedResponse(url);
    if(searchPage(url)===1){
      const next=new URL(response.headers.get('link')!.match(/<([^>]+)>/)![1]!);
      next.searchParams.set('simple','false');next.searchParams.set('page','1');
      response.headers.set('link',`<${next.href}>; rel="next"`);
    }
    return response;
  }), '', ''));
  const report=await core.check(request), result=report.sources.find(s=>s.source==='gitlab')!;
  assert.deepEqual(seen.map(searchPage),[1,2,2,3]);
  assert.equal(seen[0]!.searchParams.get('pagination'),'keyset');
  assert.equal(seen[1]!.href,seen[2]!.href);
  assert(seen.every(url=>url.searchParams.get('search')===request.queries[0]));
  assert.equal(result.pagination?.mode,'keyset');
  assert.equal(result.pagination?.pagesFetched,3);
  assert.equal(result.pagination?.stopReason,'exhausted');
  assert.equal(result.candidates.length,13);
  assert.equal(result.failures?.[0]?.page,2);
  assert.equal(result.failures?.[0]?.retry,'recovered');
});

test('invalid/multiple GitLab next links retain the current page without following them', async t => {
  for(const kind of ['host','search','missing_cursor','path','multiple','oversized','credential','privilege','unknown']){
    let calls=0;
    const core=new ReuseAssistant(await fixture(t),new Http(fakeFetch(url=>{
      calls++;
      const response=pagedResponse(url), next=new URL(url);next.searchParams.set('id_after','6');
      if(kind==='host')next.hostname='example.org';
      if(kind==='search')next.searchParams.set('search','different');
      if(kind==='missing_cursor')next.searchParams.delete('id_after');
      if(kind==='path')next.pathname='/api/v4/projects/1';
      if(kind==='oversized')next.searchParams.set('simple','x'.repeat(4096));
      if(kind==='credential')next.searchParams.set('access_token','should-never-appear');
      if(kind==='privilege')next.searchParams.set('with_custom_attributes','true');
      if(kind==='unknown')next.searchParams.set('toString','ignored');
      const link=`<${next.href}>; rel="next"`;
      const other=new URL(next);other.searchParams.set('id_after','12');
      response.headers.set('link',kind==='multiple'?`${link}, <${other.href}>; rel="next"`:link);return response;
    }), '', ''));
    const result=(await core.check(request)).sources.find(s=>s.source==='gitlab')!;
    assert.equal(calls,1,kind);assert.equal(result.status,'partial',kind);
    assert.equal(result.candidates.length,6,kind);assert.equal(result.pagination?.pagesFetched,1,kind);
    assert.equal(result.pagination?.hasMore,true,kind);assert.equal(result.pagination?.stopReason,'invalid_continuation',kind);
    assert(!JSON.stringify(result).includes('should-never-appear'));
  }
});

test('GitLab cursor cycles stop before re-reading a prior URL and keep all successful pages', async t => {
  const seen: URL[]=[];
  const core=new ReuseAssistant(await fixture(t),new Http(fakeFetch(url=>{
    seen.push(url);const response=pagedResponse(url);
    if(searchPage(url)===3){const next=new URL(url);next.searchParams.set('id_after','6');response.headers.set('link',`<${next.href}>; rel="next"`);}
    return response;
  }), '', ''));
  const result=(await core.check(request)).sources.find(s=>s.source==='gitlab')!;
  assert.deepEqual(seen.map(searchPage),[1,2,3]);assert.equal(result.candidates.length,13);
  assert.equal(result.status,'partial');assert.equal(result.pagination?.pagesFetched,3);
  assert.equal(result.pagination?.hasMore,true);assert.equal(result.pagination?.stopReason,'cursor_cycle');
});

test('NuGet versioned index entries deduplicate endpoints and fallback preserves offsets and endpoint evidence', async t => {
  for(const recover of [true,false]){
    const searches: URL[]=[];
    let indexCalls=0;
    const core=new ReuseAssistant(await fixture(t),new Http(fakeFetch(url=>{
      if(url.hostname==='api.nuget.org'){indexCalls++;return index();}
      searches.push(url);
      if(searchPage(url)===1)return pagedResponse(url);
      return url.hostname===new URL(primary).hostname?json({},503):recover?pagedResponse(url):json({},502);
    }), '', ''));
    const result=(await core.check({...request,sources:['nuget'],maxPages:2})).sources.find(s=>s.source==='nuget')!;
    assert.deepEqual(searches.map(url=>[url.hostname,url.searchParams.get('skip')]),[[new URL(primary).hostname,'0'],[new URL(primary).hostname,'6'],[new URL(secondary).hostname,'6']]);
    assert.equal(result.failures?.[0]?.page,2);
    assert.equal(indexCalls,1);
    assert.equal(new URL(result.failures![0]!.error.endpoint!).hostname,new URL(primary).hostname);
    assert.equal(result.failures?.[0]?.retry,recover?'recovered':'failed');
    assert.equal(result.candidates.length,recover?12:6);assert.equal(result.pagination?.pagesFetched,recover?2:1);
    if(recover){assert.equal(new URL(result.endpoint!).hostname,new URL(secondary).hostname);assert.equal(result.error,undefined);}
    else {assert.equal(new URL(result.error!.endpoint!).hostname,new URL(secondary).hostname);assert.equal(new URL(result.failures![0]!.retryError!.endpoint!).hostname,new URL(secondary).hostname);}
  }
  for(const policy of [{maxRetries:0,response:()=>json({},503)},{maxRetries:1,response:()=>json({},401)},{maxRetries:1,response:()=>json({},429,{'retry-after':'60'})},{maxRetries:1,response:()=>json({data:'invalid'})}]){
    let searches=0;
    const core=new ReuseAssistant(await fixture(t),new Http(fakeFetch(url=>{if(url.hostname==='api.nuget.org')return index();searches++;return policy.response();}), '', ''));
    const result=(await core.check({...request,sources:['nuget'],maxPages:1,maxRetries:policy.maxRetries})).sources.find(s=>s.source==='nuget')!;
    assert.equal(searches,1);assert.equal(result.failures?.[0]?.retry,'not_retried');
    assert.equal(new URL(result.error!.endpoint!).hostname,new URL(primary).hostname);
  }
  let malformedCalls=0;
  const malformed=new ReuseAssistant(await fixture(t),new Http(fakeFetch(()=>{malformedCalls++;return json({resources:[null]});}), '', ''));
  const result=(await malformed.check({...request,sources:['nuget'],maxPages:1})).sources.find(s=>s.source==='nuget')!;
  assert.equal(malformedCalls,1);assert.equal(result.error?.code,'invalid_response');assert.equal(result.failures?.[0]?.retry,'not_retried');
});

test('real MCP returns GitLab keyset progress through the shared discovery core', async t => {
  const root=await fixture(t), client=new Client({name:'continuation-acceptance',version:'1.0.0'});
  t.after(async()=>{await client.close();});
  await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./pagination-mcp-server.js',import.meta.url)),root],stderr:'pipe'}));
  const called:any=await client.callTool({name:'check_reuse',arguments:{...request}});
  assert.notEqual(called.isError,true,called.content?.[0]?.text);
  const result=JSON.parse(called.content[0].text).sources.find((s:any)=>s.source==='gitlab');
  assert.equal(result.pagination.mode,'keyset');assert.equal(result.pagination.pagesFetched,3);assert.equal(result.candidates.length,13);
});

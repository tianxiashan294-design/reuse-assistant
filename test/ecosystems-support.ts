import { createHash } from 'node:crypto';
import { fakeFetch, json } from './support.js';
export const CABAL='cabal-version: 2.4\nname: 3d-fixture-p0\nversion: 10.0\nlicense: BSD-3-Clause\n';
export const POM='<project><modelVersion>4.0.0</modelVersion><groupId>fixture</groupId><artifactId>scheduler-0</artifactId><version>1.0.0</version><licenses><license><name>MIT</name></license></licenses></project>';
export const RELEASE={author:'FIXTURE',name:'Actual-Release-0-v1.0',distribution:'Schedule-Tools-0',version:'1.0',abstract:'scheduler',status:'latest',authorized:true,maturity:'released',resources:{}};
export type EcosystemOptions=Partial<{pom:string;cabal:string;hash:string;count:number;snapshot:boolean;timedOut:boolean;failedShards:number;release:Record<string,unknown>}>;
export const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
export function ecosystemsResponse(url:URL,options:EcosystemOptions={}):Response|undefined {
  const host=url.hostname,p=url.pathname;
  if(host==='api.github.com'&&p==='/search/repositories')return json({items:[]});
  if(host==='gitlab.com'&&p==='/api/v4/projects')return json([]);
  if(host==='clojars.org'&&p==='/search'){
    const page=Number(url.searchParams.get('page')??1),offset=(page-1)*24;
    const results=Array.from({length:Math.max(0,Math.min(24,25-offset))},(_,i)=>({group_name:'fixture',jar_name:`scheduler-${offset+i}`,version:options.snapshot?'1.0.0-SNAPSHOT':'1.0.0',description:'scheduler'}));
    return json({count:results.length,'total-hits':25,'results-per-page':24,offset,results});
  }
  if(host==='repo.clojars.org')return new Response(options.pom??POM);
  if(host==='hackage.haskell.org'){
    if(p==='/packages/search')return json(Array.from({length:options.count??13},(_,i)=>({name:`3d-fixture-p${i}`})));
    if(p.endsWith('/revisions/'))return json([0,3,1].map(number=>({number,sha256:options.hash??sha(options.cabal??CABAL),time:'2026-01-01T00:00:00Z'})));
    if(/\/revision\/\d+\.cabal$/.test(p))return new Response(options.cabal??CABAL);
    if(/^\/package\/[^/]+\.json$/.test(p))return json({'9.0':'normal','10.0':'normal','11.0':'deprecated'});
  }
  if(host==='fastapi.metacpan.org'){
    if(p==='/v1/release/_search'){
      const offset=Number(url.searchParams.get('from')??0),size=Number(url.searchParams.get('size')??6);
      const hits=Array.from({length:Math.max(0,Math.min(size,13-offset))},(_,i)=>({_source:{...RELEASE,name:`Actual-Release-${offset+i}-v1.0`,distribution:`Schedule-Tools-${offset+i}`}}));
      return json({timed_out:options.timedOut??false,_shards:{failed:options.failedShards??0},hits:{total:{value:13,relation:'eq'},hits}});
    }
    if(p.startsWith('/v1/release/'))return json({total:1,release:options.release??RELEASE});
  }
  return undefined;
}
export const ecosystemsFetch=(options:EcosystemOptions={})=>fakeFetch(url=>{
  const response=ecosystemsResponse(url,options);if(!response)throw new Error(`Unexpected ecosystem fixture URL ${url.href}`);return response;
});

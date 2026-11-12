import { readFile } from 'node:fs/promises';
import { json } from './support.js';
export const scenarios = JSON.parse(await readFile(new URL('../../test/recall-scenarios.json', import.meta.url), 'utf8'));
export function recallResponse(url: URL): Response {
  const query = (url.searchParams.get('q') ?? url.searchParams.get('text') ?? url.searchParams.get('query') ?? '').replace(/ in:name,description,readme$/, '');
  if (query !== scenarios.fairness.query) return json({ total: query === scenarios.crossLanguage.english ? 1 : 0, objects: query === scenarios.crossLanguage.english ? [{package:{name:scenarios.crossLanguage.target,version:'1.0.0',description:query}}] : [] });
  const source = url.hostname === 'api.github.com' ? 'github' : url.hostname === 'registry.npmjs.org' ? 'npm' : 'rubygems';
  const size = source === 'rubygems' ? 30 : 6, count = scenarios.fairness[`${source}Count`];
  const page = source === 'npm' ? Number(url.searchParams.get('from') ?? 0) / 6 + 1 : Number(url.searchParams.get('page') ?? 1);
  const rows = Array.from({length:Math.max(0,Math.min(size,count-(page-1)*size))}, (_, index) => {
    const i = (page-1)*size+index;
    const best = source === 'rubygems' && i === 17 || source === 'github' && i === 0 || source === 'npm' && i < 2;
    return {i,name:`fairness-${source}-${i}`,description:best ? query : 'fairness',version:'1.0.0'};
  });
  if (source === 'github') return json({total_count:count,items:rows.map(p=>({...p,full_name:p.i===0?'example/shared':`example/${p.name}`}))});
  if (source === 'npm') return json({total:count,objects:rows.map(p=>({package:{...p,links:p.i<2?{repository:'git+https://github.com/example/shared.git'}:{}}}))});
  return json(rows.map(p=>({...p,info:p.description})));
}

import type { CheckInput, QueryPlanEntry } from './types.js';

/** Host-supplied language variants, never inferred or translated by the core. */
export function planQueries(queries: string[], variants: CheckInput['queryVariants']) {
  const originals = [...new Set(queries.map(query => query.trim()))];
  const plan: QueryPlanEntry[] = originals.map(query => ({ query, origin: query, kind: 'original' }));
  if (variants === undefined) return { originals, plan, executed: originals, variants };
  if (!Array.isArray(variants) || variants.length > 3) throw new Error('queryVariants accepts up to three original-query entries');
  const anchors = new Map<string, string[]>();
  for (const entry of variants) {
    if (!entry || typeof entry.query !== 'string' || entry.query.length > 300 || !Array.isArray(entry.variants) || entry.variants.length > 2 ||
      entry.variants.some(value => typeof value !== 'string' || !value.trim() || value.length > 300)) {
      throw new Error('queryVariants requires an original query and up to two nonempty variants of at most 300 characters');
    }
    const anchor = entry.query.trim();
    if (!originals.includes(anchor) || anchors.has(anchor)) throw new Error('queryVariants anchors must uniquely match original queries');
    anchors.set(anchor, entry.variants.map(value => value.trim()));
  }
  const normalized = originals.filter(query => anchors.has(query)).map(query => ({ query, variants: anchors.get(query)! }));
  for (const entry of normalized) for (const query of entry.variants) plan.push({ query, origin: entry.query, kind: 'variant' });
  return { originals, plan, executed: [...new Set(plan.map(entry => entry.query))], variants: normalized };
}

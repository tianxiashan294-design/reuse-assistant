import path from 'node:path';
import type { CallEdge, CodeAnalysis, CodeSegment, EvidenceFile, Inspection } from './types.js';

export type SyntaxNode = { type: string; start?: number | null; end?: number | null; [key: string]: any };
export interface SyntaxEntry { node: SyntaxNode; parent?: SyntaxNode; owner: CodeSegment }
export interface LinkModule { file: EvidenceFile; program: SyntaxNode; entries: SyntaxEntry[]; complete: boolean }
type Binding = { target?: string; source?: string; imported?: string; reason?: string };
type Module = LinkModule & { id: string; bindings: Map<string, Binding>; exports: Map<string, Binding>; unsafe: Set<string>; dynamicScope: boolean };
type Target = { target?: string; via: string[]; reason?: string };
const EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.mts', '.cjs', '.cts'];
const CALLS = new Set(['CallExpression', 'OptionalCallExpression', 'NewExpression']);
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const MAX_CALLS = 300;

// A conservative module-level resolver, not a lexical scope or runtime evaluator.
// Any competing binding anywhere in a module disables that name in the module.
function patternNames(node: SyntaxNode | undefined): string[] {
  if (!node) return [];
  const names: string[] = [];
  const stack = [node];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.type === 'Identifier') names.push(n.name);
    else if (n.type === 'RestElement') stack.push(n.argument);
    else if (n.type === 'AssignmentPattern') stack.push(n.left);
    else if (n.type === 'ArrayPattern') stack.push(...n.elements.filter(Boolean));
    else if (n.type === 'ObjectPattern') for (const p of n.properties) stack.push(p.type === 'RestElement' ? p.argument : p.value);
    else if (n.type === 'TSParameterProperty') stack.push(n.parameter);
  }
  return names;
}

export function linkCode(inspection: Inspection, analysis: CodeAnalysis, syntax: LinkModule[], foreignCalls: CallEdge[] = []): void {
  const linkage = analysis.linkage = { resolver: 'inspection-relative-v1' as const, coverage: 'complete' as 'complete' | 'partial', calls: [] as CallEdge[], gaps: [] as string[] };
  const gap = (message: string) => { linkage.coverage = 'partial'; if (!linkage.gaps.includes(message)) linkage.gaps.push(message); };
  if (analysis.coverage === 'partial') gap('Structural analysis is incomplete; only fully traversed, unique file evidence can supply links.');
  const counts = new Map<string, number>();
  for (const file of inspection.files) counts.set(file.path, (counts.get(file.path) ?? 0) + 1);
  const modules = new Map<string, Module>();
  for (const m of syntax) {
    if (!m.complete || counts.get(m.file.path) !== 1) { gap(`${m.file.path}: incomplete or duplicate file context; links withheld.`); continue; }
    const id = analysis.segments.find(s => s.path === m.file.path && s.kind === 'module')!.id;
    modules.set(m.file.path, { ...m, id, bindings: new Map(), exports: new Map(), unsafe: new Set(), dynamicScope: false });
  }

  function resolveModule(from: string, specifier: string): { module?: Module; status: 'resolved' | 'missing' | 'ambiguous' | 'external' | 'unsupported'; reason?: string } {
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) return { status: 'external', reason: 'Package/absolute specifiers require runtime or project configuration; not resolved.' };
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
    const ext = path.posix.extname(base);
    const suffixes: Record<string, string[]> = { '.js': ['.js', '.jsx', '.ts', '.tsx'], '.mjs': ['.mjs', '.mts'], '.cjs': ['.cjs', '.cts'] };
    const possible = ext ? (suffixes[ext]?.map(e => base.slice(0, -ext.length) + e) ?? [base])
      : [base, ...EXTENSIONS.map(e => base + e), ...EXTENSIONS.map(e => `${base}/index${e}`)];
    const found = [...new Set(possible.filter(p => counts.has(p)))];
    if (!found.length) return { status: 'missing', reason: 'No inspected target; supply dependency context explicitly.' };
    if (found.length !== 1 || counts.get(found[0]!) !== 1) return { status: 'ambiguous', reason: 'Multiple possible inspected targets; project/runtime resolution is unknown.' };
    const module = modules.get(found[0]!);
    return module ? { module, status: 'resolved' } : { status: 'unsupported', reason: 'Target has excerpted, invalid, unsupported or incompletely traversed syntax.' };
  }

  for (const edge of analysis.imports) {
    // Foreign-language specifiers must never enter JS/TS path resolution.
    if (edge.resolution === 'unsupported') { gap(`${edge.from}:${edge.line}: ${edge.specifier}: ${edge.reason}`); continue; }
    const resolved = resolveModule(edge.from, edge.specifier);
    edge.resolution = resolved.status;
    edge.reason = resolved.reason;
    if (resolved.module) { edge.targetPath = resolved.module.file.path; edge.targetModuleId = resolved.module.id; }
    else {
      gap(`${edge.from}:${edge.line}: ${edge.specifier}: ${resolved.reason}`);
      if (edge.resolvedPath) {
        analysis.coverage = 'partial';
        analysis.gaps.push(`${edge.from}: dependency ${edge.specifier} has no inspected target with unique complete syntax (${resolved.status}).`);
      }
    }
  }

  for (const parser of analysis.parsers ?? []) gap(`${parser.path}: ${parser.language} definition/call linkage is not implemented; syntactic facts only.`);

  for (const m of modules.values()) {
    const allowed = new Set<SyntaxNode>();
    const add = (name: string, binding: Binding, identifier?: SyntaxNode) => {
      if (m.bindings.has(name)) m.unsafe.add(name);
      m.bindings.set(name, binding);
      if (identifier) allowed.add(identifier);
    };
    const target = (node: SyntaxNode): Binding => ({ target: m.entries.find(e => e.node === node)?.owner.id });
    for (const statement of m.program.body) {
      if (statement.type === 'ImportDeclaration') {
        for (const s of statement.specifiers) add(s.local.name, {
          source: statement.source.value,
          imported: s.type === 'ImportDefaultSpecifier' ? 'default' : s.imported?.name ?? s.imported?.value,
          ...((statement.importKind === 'type' || s.importKind === 'type' || s.type === 'ImportNamespaceSpecifier') ? { reason: 'Type-only or namespace binding; direct callable target is unknown.' } : {}),
        }, s.local);
      }
      const declaration = statement.type.startsWith('Export') ? statement.declaration : statement;
      if (declaration?.type === 'FunctionDeclaration' && declaration.id && declaration.body) add(declaration.id.name, target(declaration), declaration.id);
      if (declaration?.type === 'VariableDeclaration') for (const d of declaration.declarations) {
        if (d.id.type === 'Identifier') add(d.id.name, declaration.kind === 'const' && FUNCTIONS.has(d.init?.type)
          ? target(d.init) : { reason: 'Only stable top-level function declarations/const function values are linked.' }, d.id);
      }
    }
    // Collect all competing declarations and writes, including destructuring,
    // catch/loop bindings, parameters and nested named expressions.
    for (const { node } of m.entries) {
      const declarations: SyntaxNode[] = [];
      if (node.type === 'VariableDeclarator') declarations.push(node.id);
      if (/Function|Method/.test(node.type)) { if (node.id) declarations.push(node.id); declarations.push(...(node.params ?? [])); }
      if (['ClassDeclaration', 'ClassExpression', 'CatchClause', 'TSEnumDeclaration', 'TSModuleDeclaration', 'TSImportEqualsDeclaration', 'TSDeclareFunction'].includes(node.type)) declarations.push(node.id ?? node.param);
      for (const p of declarations) if (p && !allowed.has(p)) for (const name of patternNames(p)) m.unsafe.add(name);
      if (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression') for (const name of patternNames(node.left ?? node.argument)) m.unsafe.add(name);
      if (node.type === 'ForInStatement' || node.type === 'ForOfStatement') for (const name of patternNames(node.left)) m.unsafe.add(name);
      if (node.type === 'WithStatement' || node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'eval') m.dynamicScope = true;
    }
    const exportBinding = (name: string, binding: Binding) => {
      m.exports.set(name, m.exports.has(name) ? { reason: 'Duplicate export identity.' } : binding);
    };
    for (const statement of m.program.body) {
      if (statement.type === 'ExportDefaultDeclaration') {
        const d = statement.declaration;
        exportBinding('default', FUNCTIONS.has(d.type) && d.body ? (d.id ? { imported: d.id.name } : target(d))
          : d.type === 'Identifier' ? { imported: d.name } : { reason: 'Unsupported default export expression.' });
      }
      if (statement.type !== 'ExportNamedDeclaration' || statement.exportKind === 'type') continue;
      const d = statement.declaration;
      if (d?.id?.name) exportBinding(d.id.name, { imported: d.id.name });
      for (const v of d?.declarations ?? []) if (v.id.type === 'Identifier') exportBinding(v.id.name, { imported: v.id.name });
      for (const s of statement.specifiers) if (s.type === 'ExportSpecifier' && s.exportKind !== 'type') exportBinding(s.exported.name ?? s.exported.value, {
        imported: s.local.name ?? s.local.value, ...(statement.source ? { source: statement.source.value } : {}),
      });
    }
  }

  function local(m: Module, name: string, seen: Set<string>): Target {
    if (m.dynamicScope || m.unsafe.has(name)) return { via: [], reason: 'Shadowed/reassigned binding or dynamic scope; target withheld.' };
    const b = m.bindings.get(name);
    if (!b || b.reason) return { via: [], reason: b?.reason ?? 'No stable top-level callable binding; parameters, globals and nested scopes are unresolved.' };
    return b.target ? { target: b.target, via: [] } : imported(m, b, seen);
  }
  function imported(m: Module, b: Binding, seen: Set<string>): Target {
    if (b.reason) return { via: [], reason: b.reason };
    const r = resolveModule(m.file.path, b.source!);
    return r.module ? exported(r.module, b.imported!, seen) : { via: [], reason: r.reason };
  }
  function exported(m: Module, name: string, seen: Set<string>): Target {
    const key = JSON.stringify([m.file.path, name]);
    if (seen.has(key) || seen.size >= 10) return { via: [m.id], reason: 'Re-export cycle or 10-hop resolution limit; target withheld.' };
    const next = new Set([...seen, key]);
    const b = m.exports.get(name);
    if (!b || b.reason || m.dynamicScope) return { via: [m.id], reason: b?.reason ?? 'Export not confirmed (including export-star/type-only exports or dynamic scope).' };
    const r = b.source ? imported(m, b, next) : b.target ? { target: b.target, via: [] } : local(m, b.imported!, next);
    return { ...r, via: [...new Set([m.id, ...r.via])] };
  }
  outer: for (const m of modules.values()) for (const { node, owner } of m.entries) {
    if (!CALLS.has(node.type) && node.type !== 'ImportExpression') continue;
    if (linkage.calls.length >= MAX_CALLS) { gap('Call-link budget reached (300); remaining calls are unreported.'); break outer; }
    const callee = node.callee;
    const direct = node.type !== 'NewExpression' && callee?.type === 'Identifier';
    const r = direct ? local(m, callee.name, new Set()) : { via: [], reason: 'Member, constructor, dynamic import or computed call; runtime dispatch is unresolved.' };
    const edge: CallEdge = { fromSegmentId: owner.id, from: m.file.path, line: node.loc?.start.line ?? 1,
      callee: callee ? m.file.content.slice(callee.start, callee.end).slice(0, 120) : 'import',
      status: r.target ? 'resolved' : 'unresolved', ...(r.target ? { targetSegmentId: r.target, viaModuleIds: r.via } : { reason: r.reason }) };
    linkage.calls.push(edge);
    if (!r.target) gap(`${edge.from}:${edge.line}: ${edge.callee}: ${edge.reason}`);
  }
  for (const edge of foreignCalls) {
    if (linkage.calls.length >= MAX_CALLS) { gap('Call-link budget reached (300); remaining calls are unreported.'); break; }
    linkage.calls.push(edge);
    gap(`${edge.from}:${edge.line}: ${edge.callee}: ${edge.reason}`);
  }
}

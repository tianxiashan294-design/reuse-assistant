import { Parser, Language, type Node, type Tree } from 'web-tree-sitter';
import { readFile } from 'node:fs/promises';
import type { CodeAnalysis, CodeSegment, EvidenceFile, CallEdge } from './types.js';
import type { SyntaxNode } from './linking.js';

type SupportedLanguage = 'python' | 'go' | 'rust' | 'java' | 'c_sharp' | 'c' | 'cpp' | 'php' | 'ruby' | 'kotlin' | 'swift' | 'bash' | 'lua';
const VERSIONS = { python: '0.25.0', go: '0.25.0', rust: '0.24.0', java: '0.23.5', c_sharp: '0.23.5', c: '0.24.1', cpp: '0.23.4', php: '0.25.1', ruby: '0.23.1', kotlin: '1.1.0', swift: '0.7.3', bash: '0.25.1', lua: '0.5.0' };
const BOUNDARIES: Record<SupportedLanguage, Set<string>> = {
  python: new Set(['function_definition', 'class_definition', 'lambda']),
  go: new Set(['function_declaration', 'method_declaration', 'type_spec', 'type_alias', 'func_literal']),
  rust: new Set(['function_item', 'function_signature_item', 'struct_item', 'union_item', 'enum_item', 'trait_item', 'impl_item', 'type_item', 'mod_item', 'closure_expression', 'macro_definition']),
  java: new Set(['class_declaration', 'interface_declaration', 'enum_declaration', 'record_declaration', 'annotation_type_declaration', 'method_declaration', 'constructor_declaration', 'compact_constructor_declaration', 'lambda_expression']),
  c_sharp: new Set(['namespace_declaration', 'file_scoped_namespace_declaration', 'class_declaration', 'interface_declaration', 'struct_declaration', 'enum_declaration', 'record_declaration', 'delegate_declaration', 'method_declaration', 'constructor_declaration', 'destructor_declaration', 'property_declaration', 'indexer_declaration', 'operator_declaration', 'conversion_operator_declaration', 'local_function_statement', 'lambda_expression', 'anonymous_method_expression']),
  c: new Set(['function_definition', 'struct_specifier', 'union_specifier', 'enum_specifier', 'type_definition']),
  cpp: new Set(['function_definition', 'class_specifier', 'struct_specifier', 'union_specifier', 'enum_specifier', 'type_definition', 'namespace_definition', 'template_declaration', 'alias_declaration', 'concept_definition', 'lambda_expression']),
  php: new Set(['namespace_definition', 'class_declaration', 'interface_declaration', 'trait_declaration', 'enum_declaration', 'function_definition', 'method_declaration', 'anonymous_function', 'arrow_function', 'anonymous_class']),
  ruby: new Set(['module', 'class', 'singleton_class', 'method', 'singleton_method', 'lambda']),
  kotlin: new Set(['class_declaration', 'object_declaration', 'object_literal', 'function_declaration', 'secondary_constructor', 'anonymous_initializer', 'type_alias', 'lambda_literal']),
  swift: new Set(['class_declaration', 'protocol_declaration', 'function_declaration', 'protocol_function_declaration', 'init_declaration', 'deinit_declaration', 'subscript_declaration', 'typealias_declaration', 'lambda_literal']),
  bash: new Set(['function_definition']),
  lua: new Set(['function_declaration', 'function_definition']),
};
let initialized: Promise<void> | undefined;
const languages = new Map<SupportedLanguage, Promise<Language>>();

export function structuralLanguage(file: string): SupportedLanguage | undefined {
  const extensions: Record<string, SupportedLanguage> = { py: 'python', go: 'go', rs: 'rust', java: 'java', cs: 'c_sharp', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp', php: 'php', phtml: 'php', rb: 'ruby', rake: 'ruby', gemspec: 'ruby', kt: 'kotlin', kts: 'kotlin', swift: 'swift', sh: 'bash', bash: 'bash', lua: 'lua' };
  return extensions[file.split('.').at(-1)?.toLowerCase() ?? ''];
}

async function load(language: SupportedLanguage): Promise<Language> {
  initialized ??= Parser.init().catch(error => { initialized = undefined; throw error; });
  await initialized;
  let pending = languages.get(language);
  if (!pending) {
    pending = readFile(new URL(`../../assets/grammars/tree-sitter-${language}.wasm`, import.meta.url))
      .then(data => Language.load(data)).catch(error => { languages.delete(language); throw error; });
    languages.set(language, pending);
  }
  return pending;
}

type Emit = (file: EvidenceFile, node: SyntaxNode, kind: string, symbol: string, parentId?: string) => CodeSegment | undefined;

// Grammars and evidence are data. Neither source programs nor native build scripts run here.
export async function analyzePolyglot(file: EvidenceFile, language: SupportedLanguage, result: CodeAnalysis,
  emit: Emit, visit: () => boolean, gap: (message: string) => void, calls: CallEdge[]): Promise<void> {
  const grammar = await load(language);
  const parser = new Parser();
  let tree: Tree | null = null;
  try {
    parser.setLanguage(grammar);
    const deadline = performance.now() + 1000;
    tree = parser.parse(file.content, null, { progressCallback: () => performance.now() >= deadline });
    if (!tree) throw new Error('WASM parse deadline reached');
    if (tree.rootNode.hasError) throw new Error('grammar reported ERROR or missing syntax');
    const provenance = `web-tree-sitter@0.27.1/tree-sitter-${language}@${VERSIONS[language]}`;
    (result.parsers ??= []).push({ path: file.path, language, parser: provenance });
    if (!result.parser.includes('web-tree-sitter')) result.parser += ' + web-tree-sitter@0.27.1';
    const syntax = (node: Node): SyntaxNode => ({ type: node.type, start: node.startIndex, end: node.endIndex,
      loc: { start: { line: node.startPosition.row + 1 }, end: { line: node.endPosition.row + 1 } } });
    // The module includes leading/trailing trivia, just as the Babel Program does.
    const module = emit(file, { type: 'Program', start: 0, end: file.content.length }, 'module', file.path)!;
    if (/\.h$/i.test(file.path)) gap(`${file.path}: ambiguous .h header parsed as C; C++ selection needs project context or an explicit C++ extension.`);
    const stack = [{ node: tree.rootNode, owner: module }];
    const imported = (specifier: string, node: Node) => result.imports.push({ from: file.path, specifier,
      line: (file.startLine ?? 1) + node.startPosition.row, kind: 'import', resolution: 'unsupported',
      reason: `${language} module/project resolution is not implemented; review the original import and dependency context.` });
    // Decode only plain literals. Escapes, interpolation and computed paths stay visible.
    const importLiteral = (target: Node | null, node: Node) => {
      if (!target) { gap(`${file.path}: missing ${language} load argument; dependency is unknown.`); return; }
      const text = target.text;
      const literal = /^(['"])([^'"\\\r\n$#]*)\1$/.exec(text);
      if (literal) imported(literal[2]!, node);
      else if (language === 'bash' && target.type === 'word' && /^[\w./-]+$/.test(text)) imported(text, node);
      else { imported(text, node); gap(`${file.path}: dynamic/escaped ${language} loading is retained literally; target is unresolved.`); }
    };
    const fact = (owner: CodeSegment, field: 'calls' | 'writes', value: string | undefined) => {
      if (!value) return;
      value = value.slice(0, 120);
      if (owner[field].includes(value)) return;
      if (owner[field].length < 60) owner[field].push(value);
      else gap(`${file.path}: ${field} fact budget reached; additional facts are unreported.`);
    };
    while (stack.length) {
      if (!visit()) { gap(`${file.path}: AST node/segment budget reached; traversal is incomplete.`); break; }
      const { node, owner } = stack.pop()!;
      const type = node.type;
      const field = (name: string) => node.childForFieldName(name);
      let current = owner;
      if (BOUNDARIES[language].has(type)) {
        // Include Python decorators in the declaration's evidence range.
        const boundary = node.parent?.type === 'decorated_definition' ? node.parent : node;
        let declarator = field('declarator');
        // Follow only the grammar's declarator chain, never parameter names.
        for (let hop = 0; hop < 30 && declarator?.childForFieldName('declarator'); hop++) declarator = declarator.childForFieldName('declarator');
        const name = field('name')?.text ?? (type === 'impl_item' ? field('type')?.text : declarator?.text)
          ?? (language === 'kotlin' && type === 'type_alias' ? node.namedChildren.find(n => n.type === 'identifier')?.text : undefined) ?? `<${type}>`;
        current = emit(file, syntax(boundary), type, name.slice(0, 120), owner.id)!;
      }
      if (language === 'python') {
        if (type === 'import_statement') for (const n of node.childrenForFieldName('name')) imported((n.childForFieldName('name') ?? n).text, node);
        if (type === 'import_from_statement') imported(field('module_name')!.text, node);
        if (type === 'future_import_statement') imported('__future__', node);
      } else if (language === 'go' && type === 'import_spec') {
        const literal = field('path')?.text;
        if (literal) {
          // Go interpreted literals have escapes that are not JSON escapes.
          if (literal.includes('\\')) { imported(literal, node); gap(`${file.path}: escaped Go import path retained literally; decoding is unsupported.`); }
          else imported(literal.slice(1, -1), node);
        }
      } else if (language === 'rust') {
        if (type === 'use_declaration') imported(field('argument')?.text ?? node.text, node);
        if (type === 'extern_crate_declaration') imported(field('name')?.text ?? node.text, node);
        if (type === 'mod_item' && !field('body')) gap(`${file.path}:${node.startPosition.row + 1}: out-of-line Rust module is uninspected.`);
        if (type === 'macro_invocation' || type === 'macro_definition' || type === 'attribute_item') gap(`${file.path}: Rust macro/attribute expansion is not analysed.`);
      } else if (language === 'java' && type === 'import_declaration') {
        const target = node.namedChildren.find(n => ['identifier', 'scoped_identifier'].includes(n.type));
        if (target) imported(target.text + (node.namedChildren.some(n => n.type === 'asterisk') ? '.*' : ''), node);
      } else if (language === 'c_sharp') {
        if (type === 'using_directive') {
          const target = node.namedChildren.find(n => n.id !== field('name')?.id);
          if (target) imported(target.text, node);
        }
        if (type.startsWith('preproc_')) gap(`${file.path}: C# conditional compilation is not evaluated.`);
      } else if (language === 'c' || language === 'cpp') {
        if (type === 'preproc_include') {
          const target = field('path');
          if (target) {
            const literal = ['string_literal', 'system_lib_string'].includes(target.type) && !target.text.includes('\\');
            imported(literal ? target.text.slice(1, -1) : target.text, node);
            if (!literal) gap(`${file.path}: computed/escaped include is retained literally; preprocessing is not evaluated.`);
          }
        } else if (type.startsWith('preproc_')) gap(`${file.path}: C/C++ preprocessing and conditional branches are not evaluated.`);
      } else if (language === 'php') {
        if (type === 'namespace_use_clause') {
          const target = node.namedChildren.find(n => n.id !== field('alias')?.id && ['name', 'qualified_name'].includes(n.type));
          const prefix = node.parent?.type === 'namespace_use_group'
            ? node.parent.parent?.namedChildren.find(n => n.type === 'namespace_name')?.text : undefined;
          if (target) imported((prefix ? prefix + '\\' : '') + target.text, node);
        }
        if (['include_expression', 'include_once_expression', 'require_expression', 'require_once_expression'].includes(type)) importLiteral(node.namedChild(0), node);
      } else if (language === 'kotlin' && type === 'import') {
        const target = node.namedChildren.find(n => ['qualified_identifier', 'identifier'].includes(n.type));
        if (target) imported(target.text + (node.children.some(n => n.type === '*') ? '.*' : ''), node);
      } else if (language === 'swift') {
        if (type === 'import_declaration') {
          const target = node.namedChildren.find(n => n.type === 'identifier');
          if (target) imported(target.text, node);
        }
        if (type === 'directive') gap(`${file.path}: Swift conditional compilation and directives are not evaluated.`);
      } else if (language === 'ruby' && type === 'call' && !field('receiver') && ['require', 'require_relative', 'load'].includes(field('method')?.text ?? '')) {
        importLiteral(field('arguments')?.namedChild(0) ?? null, node);
      } else if (language === 'lua' && type === 'function_call' && field('name')?.text === 'require') {
        importLiteral(field('arguments')?.namedChild(0) ?? null, node);
      } else if (language === 'bash' && type === 'command') {
        if (['source', '.'].includes(field('name')?.text ?? '')) importLiteral(field('argument'), node);
        if (field('name')?.text === 'eval') gap(`${file.path}: Bash eval is not analysed.`);
        if (field('name')?.text === 'return') current.controls.returns++;
      }
      if (['call', 'call_expression', 'macro_invocation', 'method_invocation', 'invocation_expression', 'object_creation_expression', 'new_expression', 'function_call_expression', 'member_call_expression', 'nullsafe_member_call_expression', 'scoped_call_expression', 'function_call', 'command', 'constructor_expression'].includes(type)) {
        const callee = language === 'ruby' && type === 'call'
          ? `${field('receiver') ? field('receiver')!.text + (field('operator')?.text ?? '.') : ''}${field('method')?.text ?? '<unknown method>'}`
          : language === 'php' && ['member_call_expression', 'nullsafe_member_call_expression', 'scoped_call_expression'].includes(type)
          ? `${(field('object') ?? field('scope'))?.text ?? '<unknown receiver>'}${type === 'scoped_call_expression' ? '::' : type === 'nullsafe_member_call_expression' ? '?->' : '->'}${field('name')?.text ?? '<unknown method>'}`
          : ['kotlin', 'swift'].includes(language) && type === 'call_expression' ? node.namedChild(0)?.text ?? '<unknown call>'
          : language === 'lua' && type === 'function_call' || language === 'bash' && type === 'command' ? field('name')?.text ?? '<unknown call>'
          : type === 'method_invocation'
          ? `${field('object') ? field('object')!.text + '.' : ''}${field('name')?.text ?? '<unknown method>'}`
          : (field('function') ?? field('macro') ?? field('type'))?.text ?? '<unknown call>';
        fact(current, 'calls', callee);
        if (calls.length < 300) calls.push({ from: file.path, fromSegmentId: current.id, line: (file.startLine ?? 1) + node.startPosition.row,
          callee: callee.slice(0, 120), status: 'unresolved', reason: `${language} definition/call linkage is not implemented; syntactic call only.` });
        else gap(`${file.path}: Call-link budget reached (300); remaining calls are unreported.`);
        if (language === 'python' && /^(?:__import__|importlib\.import_module)$/.test(callee)) gap(`${file.path}: dynamic Python loading is not resolved.`);
      }
      if (type === 'await' || type === 'await_expression') current.controls.awaits++;
      if (['raise_statement', 'throw_statement', 'throw_expression'].includes(type)) current.controls.throws++;
      if (['except_clause', 'except_group_clause', 'catch_clause', 'catch_block', 'rescue', 'rescue_modifier'].includes(type)) current.controls.catches++;
      if (type === 'return_statement' || type === 'return_expression' || language === 'ruby' && type === 'return') current.controls.returns++;
      if (language === 'swift' && type === 'control_transfer_statement') {
        if (node.children.some(n => n.type === 'return')) current.controls.returns++;
        if (node.children.some(n => n.type === 'throw_keyword')) current.controls.throws++;
      }
      if (['if_statement', 'if_expression', 'elif_clause', 'else_if_clause', 'elseif_statement', 'if', 'unless', 'if_modifier', 'unless_modifier', 'when', 'when_entry', 'conditional_expression', 'boolean_operator', 'match_arm', 'case_clause', 'expression_case', 'type_case', 'communication_case', 'switch_label', 'switch_expression_arm'].includes(type)) current.controls.branches++;
      if (['assignment', 'augmented_assignment', 'named_expression', 'assignment_statement', 'short_var_declaration', 'inc_statement', 'dec_statement', 'assignment_expression', 'augmented_assignment_expression', 'operator_assignment', 'variable_assignment', 'compound_assignment_expr', 'let_declaration', 'var_spec', 'update_expression', 'postfix_unary_expression', 'prefix_unary_expression'].includes(type)) {
        if (!['postfix_unary_expression', 'prefix_unary_expression'].includes(type) || /^(?:\+\+|--)|(?:\+\+|--)$/.test(node.text)) {
          const target = field('left') ?? field('target') ?? field('name') ?? field('pattern') ?? node.namedChild(0);
          if (language === 'lua' && target?.type === 'variable_list') for (const n of target.childrenForFieldName('name')) fact(current, 'writes', n.text);
          else fact(current, 'writes', target?.text);
        }
      }
      // A syntax node's children retain their nearest declaration as owner.
      const children = node.namedChildren;
      for (let i = children.length - 1; i >= 0; i--) stack.push({ node: children[i]!, owner: current });
    }
  } finally { tree?.delete(); parser.delete(); }
}

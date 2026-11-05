import { applyEdits, createScanner, findNodeAtLocation, getNodeValue, modify, parseTree, SyntaxKind } from 'jsonc-parser';
import type { Node, ParseError } from 'jsonc-parser';
import { isDeepStrictEqual } from 'node:util';

function tree(text: string, file: string): Node {
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, { allowTrailingComma: true });
  if (errors.length || !root) throw new Error(`${file} is not valid JSONC; left unchanged.`);
  if (root.type !== 'object') throw new Error(`${file} must contain a JSON object; left unchanged.`);
  const pending = [root];
  while (pending.length) {
    const node = pending.pop()!;
    if (node.type === 'object') {
      const keys = new Set<string>();
      for (const property of node.children ?? []) {
        const key: string = property.children![0]!.value;
        if (keys.has(key)) throw new Error(`${file} contains duplicate object keys; left unchanged.`);
        keys.add(key);
      }
    }
    pending.push(...node.children ?? []);
  }
  return root;
}

const body = (text: string) => text.startsWith('\uFEFF') ? text.slice(1) : text;
// getNodeValue deliberately creates null-prototype objects. Normalize data for
// comparisons with receipt JSON, preserving own keys such as __proto__.
const value = (node: Node) => JSON.parse(JSON.stringify(getNodeValue(node)));

export function jsoncObject(text: string | undefined, file: string): Record<string, any> {
  return value(tree(body(text ?? '{}\n'), file));
}

function trivia(text: string): string {
  const scanner = createScanner(text);
  let result = '';
  for (let token = scanner.scan(); token !== SyntaxKind.EOF; token = scanner.scan()) {
    if (token >= SyntaxKind.LineCommentTrivia && token <= SyntaxKind.Trivia) {
      result += text.slice(scanner.getTokenOffset(), scanner.getPosition());
    }
  }
  return result;
}

export function editJsonc(original: string | undefined, file: string, path: string[], next: unknown): string {
  const text = body(original ?? '{}\n');
  const root = tree(text, file);
  const existing = findNodeAtLocation(root, path);
  if (existing ? isDeepStrictEqual(value(existing), next) : next === undefined) return original ?? text;
  // Insert first: appending after the previous value would move its inline
  // comment to the newly inserted property. Do not format existing source.
  const edits = modify(text, path, next, { getInsertionIndex: () => 0 });
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const unit = text.match(/(?:^|\n)([\t ]+)"/)?.[1] ?? '  ';
  for (const edit of edits) {
    if (next === undefined && existing?.parent?.type === 'property') {
      const property = existing.parent;
      // The library removes punctuation and neighboring trivia as one range.
      // Retain the original trivia outside the owned property, including inline
      // comments belonging to adjacent entries. A sole trailing comma must go.
      if (property.parent?.children?.length === 1) {
        const tail = createScanner(text.slice(property.offset + property.length), true);
        if (tail.scan() === SyntaxKind.CommaToken) {
          edit.length = property.offset + property.length + tail.getPosition() - edit.offset;
        }
      }
      edit.content = trivia(text.slice(edit.offset, property.offset)) +
        trivia(text.slice(property.offset + property.length, edit.offset + edit.length));
    } else if (edit.length === 0) {
      const parent = findNodeAtLocation(root, path.slice(0, -1));
      const indent = unit.repeat(parent ? path.length : 1);
      edit.content = `${eol}${indent}${edit.content}${eol}${indent.slice(unit.length)}`;
    }
  }
  const updated = applyEdits(text, edits);
  tree(updated, file); // Never persist a fault-tolerant parser's partial result.
  return (original?.startsWith('\uFEFF') ? '\uFEFF' : '') + updated;
}

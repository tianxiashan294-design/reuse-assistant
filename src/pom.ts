import { SourceError } from './http.js';
type Node = { name: string; text: string; children: Node[] };

/** Conservative data-only subset: direct identity, no entities/inheritance. */
export function readPomIdentity(xml: string) {
  const bad = (message = 'Unsupported or malformed POM XML subset'): never => { throw new SourceError('invalid_response', message); };
  xml = xml.replace(/^\uFEFF/, '');
  if (Buffer.byteLength(xml) > 180_000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/.test(xml)) bad();
  const lex = /<!--[\s\S]*?-->|<\?xml[\s\S]*?\?>|<\/?[A-Za-z_][\w.-]*(?:[\t\n\r ]+[A-Za-z_][\w.:-]*[\t\n\r ]*=[\t\n\r ]*(?:"[^"<&]*"|'[^'<&]*'))*[\t\n\r ]*\/?>|[^<&]+/gy;
  const stack: Node[] = [];
  let root: Node | undefined, end = 0, count = 0;
  for (let match; (match = lex.exec(xml));) {
    const token = match[0], start = end;
    end = lex.lastIndex;
    if (token.startsWith('<!--')) {
      const body = token.slice(4, -3);
      if (body.includes('--') || body.endsWith('-')) bad();
      continue;
    }
    if (token.startsWith('<?')) {
      if (start !== 0 || !/^<\?xml[\t\n\r ]+version=(?:"1\.0"|'1\.0')(?:[\t\n\r ]+encoding=(?:"[A-Za-z][\w.-]*"|'[A-Za-z][\w.-]*'))?(?:[\t\n\r ]+standalone=(?:"(?:yes|no)"|'(?:yes|no)'))?[\t\n\r ]*\?>$/.test(token)) bad();
      continue;
    }
    if (!token.startsWith('<')) {
      if (token.includes(']]>') || (!stack.length && token.trim())) bad();
      if (stack.length) stack[stack.length - 1]!.text += token;
      continue;
    }
    if (token.startsWith('</')) {
      const close = token.match(/^<\/([A-Za-z_][\w.-]*)[\t\n\r ]*>$/);
      if (!close || stack.pop()?.name !== close[1]) bad();
      continue;
    }
    const open = token.match(/^<([A-Za-z_][\w.-]*)([\s\S]*?)(\/?)>$/)!;
    const attrs = [...open[2]!.matchAll(/([A-Za-z_][\w.:-]*)[\t\n\r ]*=[\t\n\r ]*("[^"]*"|'[^']*')/g)];
    if (new Set(attrs.map(a => a[1])).size !== attrs.length) bad();
    for (const a of attrs) {
      const key = a[1]!, value = a[2]!.slice(1, -1);
      if (key === 'xmlns' && (stack.length || !/^https?:\/\/maven\.apache\.org\/POM\/4\.0\.0$/.test(value))) bad();
      if (key.includes(':') && !(key === 'xmlns:xsi' && !stack.length && value === 'http://www.w3.org/2001/XMLSchema-instance') &&
          !(key === 'xsi:schemaLocation' && !stack.length && attrs.some(x => x[1] === 'xmlns:xsi' && x[2]!.slice(1, -1) === 'http://www.w3.org/2001/XMLSchema-instance'))) bad();
    }
    const node: Node = { name: open[1]!, text: '', children: [] };
    if (++count > 3000 || stack.length >= 64) bad('POM XML exceeds structural budget');
    if (stack.length) stack[stack.length - 1]!.children.push(node);
    else { if (root || node.name !== 'project') bad(); root = node; }
    if (!open[3]) stack.push(node);
  }
  if (end !== xml.length || stack.length || !root) bad();
  const scalar = (name: string): string => {
    const values = root!.children.filter(node => node.name === name);
    if (values.length !== 1) bad(`Missing or ambiguous direct project/${name}; parent inheritance is unsupported`);
    const value = values[0]!;
    if (value.children.length || !value.text.trim() || value.text.length > 4096 || /\$\{/.test(value.text)) bad(`Unsupported POM scalar ${name}; interpolation is not resolved`);
    return value.text.trim();
  };
  return { groupId: scalar('groupId'), artifactId: scalar('artifactId'), version: scalar('version') };
}

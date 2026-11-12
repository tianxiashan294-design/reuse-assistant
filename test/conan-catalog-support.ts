import { createHash } from 'node:crypto';
import { json } from './support.js';

const base = '/repos/conan-io/conan-center-index';
export const conanRevision = 'a'.repeat(40);
const rootTree = 'b'.repeat(40);
const recipesTree = 'c'.repeat(40);
export const conanRecipeTree = 'd'.repeat(40);
const allTree = 'e'.repeat(40);
export const conanConfig = 'versions:\n  "1.3.1":\n    folder: all\n';
export const conanRecipe = 'def build():\n    return "zlib"\n';
const conandata = 'sources:\n  "1.3.1":\n    url: https://example.invalid/zlib.tar.gz\n';

export interface ConanCatalogOptions {
  truncated?: boolean;
  failCatalogOnce?: boolean;
  corruptConandata?: boolean;
  binaryRecipe?: boolean;
}

function blobEntry(path: string, content: string) {
  const bytes = Buffer.from(content);
  const sha = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
  return { path, type: 'blob', mode: '100644', sha };
}

function treeEntry(path: string, sha: string) {
  return { path, type: 'tree', mode: '040000', sha };
}

function blobResponse(sha: string, content: string): Response {
  const bytes = Buffer.from(content);
  return json({ sha, encoding: 'base64', size: bytes.length, content: bytes.toString('base64') });
}

const config = blobEntry('config.yml', conanConfig);
const data = blobEntry('conandata.yml', conandata);
export const conanCatalogPath = base + '/git/trees/' + recipesTree;
export const conanHeadPath = base + '/commits/HEAD';
const fixtureNames = Array.from({ length: 8 }, (_, i) => treeEntry('scheduler-' + (7 - i), 'f'.repeat(40)));

export function conanCatalogResponse(url: URL, options: ConanCatalogOptions = {}): Response | undefined {
  if (url.origin !== 'https://api.github.com' || url.search) return undefined;
  const path = url.pathname;
  const recipeText = options.binaryRecipe ? conanRecipe + '\0' : conanRecipe;
  const recipe = blobEntry('conanfile.py', recipeText);
  if (path === conanHeadPath) return json({ sha: conanRevision, commit: { tree: { sha: rootTree } } });
  if (path === base + '/git/trees/' + rootTree) {
    return json({ sha: rootTree, tree: [treeEntry('recipes', recipesTree)], truncated: false });
  }
  if (path === conanCatalogPath) {
    if (options.failCatalogOnce) {
      options.failCatalogOnce = false;
      return json({}, 503);
    }
    return json({ sha: recipesTree, tree: [treeEntry('zlib', conanRecipeTree), ...fixtureNames], truncated: options.truncated ?? false });
  }
  if (path === base + '/git/trees/' + conanRecipeTree) {
    return json({ sha: conanRecipeTree, tree: [treeEntry('all', allTree), config], truncated: false });
  }
  if (path === base + '/git/trees/' + allTree) return json({ sha: allTree, tree: [recipe, data], truncated: false });
  if (path === base + '/git/blobs/' + config.sha) return blobResponse(config.sha, conanConfig);
  if (path === base + '/git/blobs/' + recipe.sha) return blobResponse(recipe.sha, recipeText);
  if (path === base + '/git/blobs/' + data.sha) return blobResponse(data.sha, options.corruptConandata ? conandata + ' ' : conandata);
  return undefined;
}

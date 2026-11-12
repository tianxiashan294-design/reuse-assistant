import { gitObjectId, type CatalogGit, type CatalogInspection, type CatalogSnapshot } from './cpp-git.js';
import { SourceError } from './http.js';
import type { PackageIdentity } from './types.js';

const recipeFoldersLimit = 3;
const recipeName = (name: string) => /^[a-z0-9_][a-z0-9_+.-]{1,100}$/.test(name) && name === name.trim();
const folderName = (name: string) => /^[a-zA-Z0-9_][a-zA-Z0-9_.+-]{0,100}$/.test(name) && name === name.trim();

export async function readConanCatalog(git: CatalogGit): Promise<CatalogSnapshot> {
  const head = await git.head();
  const root = await git.tree(head.tree);
  const recipes = root.entries.find(entry => entry.path === 'recipes' && entry.type === 'tree');
  if (!recipes) throw new SourceError('invalid_response', root.truncated
    ? 'GitHub truncated the Conan root tree before the recipes directory could be resolved'
    : 'Conan Center Index root tree has no recipes directory', undefined, undefined, root.url);
  const catalog = await git.tree(recipes.sha);
  const entries = catalog.entries
    .filter(entry => entry.type === 'tree' && recipeName(entry.path))
    .map(entry => ({ name: entry.path, tree: entry.sha }));
  const omitted = catalog.entries.length - entries.length;
  const notes = ['Conan Center Index matches recipe directory names in one Git commit. Live Conan remotes, description search and binary availability are outside this catalog.'];
  if (root.truncated || catalog.truncated) notes.push('GitHub reported a truncated Conan catalog tree; available recipe entries were retained.');
  if (omitted) notes.push('Skipped ' + omitted + ' unsupported Conan recipe entries.');
  return { revision: head.revision, endpoint: catalog.url, entries, partial: root.truncated || catalog.truncated || omitted > 0, notes };
}

export async function inspectConanCatalog(git: CatalogGit, pkg: PackageIdentity, evidence: CatalogInspection): Promise<void> {
  evidence.notes.push('This is Conan Center Index recipe evidence. The catalog commit and recipe tree identify the inspected source index; published versions, Conan RREV, binaries, recipe dependencies, upstream archives, source commits and package licenses remain unverified. YAML and Python are retained as text.');
  const { name, catalogRevision: revision, catalogTree: tree } = pkg;
  if (!recipeName(name) || !gitObjectId(revision) || !gitObjectId(tree)) {
    await evidence.attempt('Conan catalog identity', async () => {
      throw new SourceError('invalid_response', 'Missing or invalid fixed Conan recipe identity');
    });
    return;
  }
  evidence.metadata.registry = { source: pkg.source, name, catalogRevision: revision, recipeTree: tree };
  const path = 'recipes/' + name;
  const recipe = await evidence.attempt('Conan recipe tree ' + path, () => git.tree(tree));
  if (!recipe) return;
  if (recipe.truncated) evidence.notes.push('GitHub reported a truncated Conan recipe tree.');

  const retain = async (directory: typeof recipe, parent: string, name: string) => {
    const filePath = parent + '/' + name;
    const file = await evidence.attempt('Conan recipe file ' + filePath, async () => {
      const entry = directory.entries.find(item => item.path === name);
      if (!entry || entry.type !== 'blob' || entry.mode === '120000') {
        throw new SourceError('invalid_response', 'Expected a regular file in the fixed Conan recipe tree', undefined, undefined, directory.url);
      }
      return git.blob(entry.sha);
    });
    if (file) evidence.add(filePath, file, revision);
  };

  await retain(recipe, path, 'config.yml');
  const folders = recipe.entries.filter(entry => entry.type === 'tree' && folderName(entry.path));
  folders.sort((a, b) => a.path === b.path ? 0 : a.path === 'all' || b.path !== 'all' && a.path < b.path ? -1 : 1);
  if (folders.length > recipeFoldersLimit) evidence.notes.push('Inspected at most ' + recipeFoldersLimit + ' Conan recipe folders; remaining folders were not read.');
  if (recipe.entries.some(entry => entry.type === 'commit' || entry.type === 'tree' && !folderName(entry.path))) evidence.notes.push('Unsupported Conan recipe folder entries were not read.');
  if (!folders.length) evidence.notes.push('No supported Conan recipe folders were available in the returned tree.');
  for (const folder of folders.slice(0, recipeFoldersLimit)) {
    const parent = path + '/' + folder.path;
    const directory = await evidence.attempt('Conan recipe tree ' + parent, () => git.tree(folder.sha));
    if (!directory) continue;
    if (directory.truncated) evidence.notes.push('GitHub reported a truncated Conan recipe folder tree at ' + parent + '.');
    await retain(directory, parent, 'conanfile.py');
    await retain(directory, parent, 'conandata.yml');
  }
}
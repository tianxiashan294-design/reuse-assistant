import { REMOTE_SOURCES, type CheckInput, type RemoteSource, type SourceCapability } from './types.js';

export const SOURCE_CATALOG: SourceCapability[] = [
  { source: 'github', ecosystems: ['all'], mode: 'repository_search', limitations: ['Public GitHub repository/README search; 6 results per page within maxPages, not global code full-text.'] },
  { source: 'gitlab', ecosystems: ['all'], mode: 'repository_search', limitations: ['Public gitlab.com project name/path/description substring search ordered by ascending ID, 6 results per page within maxPages; exact public project URL lookup is single-page. Not self-hosted instances or global code full-text. Optional GITLAB_TOKEN.'] },
  { source: 'npm', ecosystems: ['javascript'], mode: 'package_search', limitations: ['npm package search; 6 results per page within maxPages; query limited to 64 characters.'] },
  { source: 'pypi', ecosystems: ['python'], mode: 'name_verification', limitations: ['Known distribution names only; no PyPI full-text search. Supply packageNames from project/installation evidence.'] },
  { source: 'crates', ecosystems: ['rust'], mode: 'package_search', limitations: ['crates.io package metadata search; 6 results per page within maxPages; no archive extraction.'] },
  { source: 'maven', ecosystems: ['java', 'kotlin', 'scala'], mode: 'package_search', limitations: ['Maven Central coordinate search; 6 results per page within maxPages. POM evidence is pinned; SCM and license interpretation require host review.'] },
  { source: 'nuget', ecosystems: ['dotnet'], mode: 'package_search', limitations: ['NuGet.org listed stable packages; 6 results per page within maxPages. Metadata endpoints discovered through the service index; inspect up to 4 registration pages.'] },
  { source: 'rubygems', ecosystems: ['ruby'], mode: 'package_search', limitations: ['RubyGems package search; up to 30 results per page within maxPages (fixed upstream page size). Published metadata does not establish a source commit.'] },
  { source: 'packagist', ecosystems: ['php'], mode: 'package_search', limitations: ['Packagist package search; 6 results per page within maxPages. Inspection selects a stable version from the full package API (2 MB cap; upstream cache may be 12 hours).'] },
];

export function selectedSources(input: CheckInput): RemoteSource[] {
  if (input.sources) {
    if (!input.sources.length || input.sources.length > REMOTE_SOURCES.length || input.sources.some(s => !REMOTE_SOURCES.includes(s))) throw new Error('Select supported nonempty sources');
    return REMOTE_SOURCES.filter(s => input.sources!.includes(s));
  }
  if (!input.ecosystem || input.ecosystem === 'auto') return [...REMOTE_SOURCES];
  return SOURCE_CATALOG.filter(s => s.ecosystems.includes('all') || s.ecosystems.includes(input.ecosystem!)).map(s => s.source);
}

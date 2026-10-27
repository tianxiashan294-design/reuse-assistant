import { REMOTE_SOURCES, type CheckInput, type RemoteSource, type SourceCapability } from './types.js';

export const SOURCE_CATALOG: SourceCapability[] = [
  { source: 'github', ecosystems: ['all'], mode: 'repository_search', limitations: ['Public GitHub repository/README search; first 6 results per query, not global code full-text.'] },
  { source: 'gitlab', ecosystems: ['all'], mode: 'repository_search', limitations: ['Public gitlab.com project name/path/description substring search or exact public project URL lookup; first 6 newest search results, not self-hosted instances or global code full-text. Optional GITLAB_TOKEN.'] },
  { source: 'npm', ecosystems: ['javascript'], mode: 'package_search', limitations: ['npm package search; first 6 results; query limited to 64 characters.'] },
  { source: 'pypi', ecosystems: ['python'], mode: 'name_verification', limitations: ['Known distribution names only; no PyPI full-text search. Supply packageNames from project/installation evidence.'] },
  { source: 'crates', ecosystems: ['rust'], mode: 'package_search', limitations: ['crates.io package metadata search; first 6 results; no archive extraction.'] },
  { source: 'maven', ecosystems: ['java', 'kotlin', 'scala'], mode: 'package_search', limitations: ['Maven Central coordinate search; first 6 results. POM evidence is pinned; SCM and license interpretation require host review.'] },
  { source: 'nuget', ecosystems: ['dotnet'], mode: 'package_search', limitations: ['NuGet.org listed stable packages; first 6 results. Metadata endpoints discovered through the service index; inspect up to 4 registration pages.'] },
  { source: 'rubygems', ecosystems: ['ruby'], mode: 'package_search', limitations: ['RubyGems package search; retain first 6 of the first page. Published metadata does not establish a source commit.'] },
  { source: 'packagist', ecosystems: ['php'], mode: 'package_search', limitations: ['Packagist package search; first 6 results. Inspection selects a stable version from the full package API (2 MB cap; upstream cache may be 12 hours).'] },
];

export function selectedSources(input: CheckInput): RemoteSource[] {
  if (input.sources) {
    if (!input.sources.length || input.sources.length > REMOTE_SOURCES.length || input.sources.some(s => !REMOTE_SOURCES.includes(s))) throw new Error('Select supported nonempty sources');
    return REMOTE_SOURCES.filter(s => input.sources!.includes(s));
  }
  if (!input.ecosystem || input.ecosystem === 'auto') return [...REMOTE_SOURCES];
  return SOURCE_CATALOG.filter(s => s.ecosystems.includes('all') || s.ecosystems.includes(input.ecosystem!)).map(s => s.source);
}

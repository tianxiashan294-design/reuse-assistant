import { SourceError } from './http.js';
import type { Candidate, PackageIdentity, RegistrySource } from './types.js';

/** Shared registry normalization; ecosystem-specific identity checks stay in adapters. */
export function registryCandidate(source: RegistrySource, query: string, name: unknown, url: string, description: unknown, version?: unknown, repository?: unknown, metadataUrl?: string, platform?: string): Candidate {
  const string = (value: unknown): string | undefined => typeof value === 'string' && value.length > 0 ? value : undefined;
  if (!string(name) || (version !== undefined && !string(version))) throw new SourceError('invalid_response', `Missing ${source} package identity`);
  const pkg: PackageIdentity = { source, name: name as string, version: string(version), url, metadataUrl, platform };
  return { id: `${source}:${name}`, source, name: pkg.name, url, description: string(description) ?? '', version: pkg.version, repository: string(repository), matchedQueries: [query], packages: [pkg] };
}

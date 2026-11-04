# Source coverage in v0.8

The long-term target is all programming languages and platforms; this release implements the finite source set below. `coverage: complete` means the selected bounded plan completed, not that every platform, language or suitable implementation was searched. `sourcePlan` lists supported capabilities, limitations and selection state; `sources` retains actual requests and failures.

v0.8 expands structural inspection with PHP/Ruby/Kotlin/Swift/Bash/Lua; it adds no registry or repository discovery adapter. Structural language coverage and ecosystem search routing are separate capabilities. Kotlin/Swift/Bash/Lua code can be inspected through repository/local candidates without adding new ecosystem selector values; see [structural coverage](ALIGNMENT.md).

| Source | Discovery | Inspection | Limits |
|---|---|---|---|
| GitHub | Public repository/README search | Commit-pinned files/directories | 6 results/page; not global source-code search |
| GitLab.com | Public name/path/description substring search; exact public project URL lookup | Commit-pinned files/directories and code ranges, nested groups | 6 results/page, ascending project ID (not relevance); directory listings capped at 100; self-hosted instances unsupported |
| npm | Package search | Published version metadata; GitHub/GitLab evidence when associated | Query at most 64 characters; 6 results/page |
| PyPI | Known distribution names | Version metadata; associated repository evidence | No PyPI full-text discovery; names must come from real project/install evidence |
| crates.io | Rust package search | Fixed version metadata and associated repository evidence | 6 results/page; repository HEAD may differ from release |
| Maven Central | Coordinate query syntax | Fixed version POM as text | 6 results/page; automatic SCM/license/parent interpretation not implemented |
| NuGet.org | Listed stable package search | Selected version metadata from discovered registration index/pages; leaf/catalog compatibility fallback | 6 results/page; at most 4 inspection registration pages; dynamically discovered service addresses; no archive extraction |
| RubyGems | Gem search | Version and platform metadata; associated repository evidence | Up to 30 results/page (fixed upstream size), retained in full; source/release association unverified |
| Packagist | Composer package search | Stable version metadata and fixed `source.reference` when supplied | 6 results/page; full package API has a 2 MB limit and an upstream cache of up to 12 hours |
| pub.dev | Official top-name completion corpus, literal substring matching (`name_search`) | Latest-version locator, then fixed version metadata/pubspec and supplied archive hash | Not full-text/description search or all-package discovery; 8-hour project corpus cache, 6 local matches/page; archives/licenses not extracted |
| Hex | Public package name/description search for Elixir/Erlang | Fixed release metadata/checksum, separate mutable package links/license metadata | 6 results/page, no supplied total; archives not extracted, repository release correspondence unverified |

Package evidence without a supported repository is explicitly partial. Missing README/license files, failed code reads, unknown SCM and unverified package/source correspondence remain visible. Packages in the same repository keep distinct aliases and versions. Repository identities include the hosting platform.

## Selection

`ecosystem: auto` (default) searches all implemented sources. `javascript`, `python`, `rust`, `java`, `dotnet`, `ruby`, and `php` select GitHub + GitLab and the matching registry. `java` includes the JVM package ecosystem used by Kotlin and Scala. `go` currently selects repository search only. Explicit `sources` override ecosystem routing. `scope: local` performs no network requests.

`dart` / `flutter` select GitHub + GitLab + pub; `elixir` / `erlang` select GitHub + GitLab + Hex. These selections add retrieval ecosystems, not structural parsers for Dart or Elixir. Use `--source pub --source hex` or MCP `sources: ["pub", "hex"]` explicitly when desired.

pub.dev's official API does not promise a description/full-text search endpoint. We fetch `/api/package-name-completion-data`, validate its finite list, preserve upstream order, and match the lowercased query as a literal name substring. Corpus cache timestamp/hit state is public, and its 8-hour project TTL is separate from the 6-hour query-result cache. `useCache: false` bypasses the latter only. Different queries/pages within one check share one corpus load; concurrent cold checks/processes may fetch independently. Totals and `exhausted` refer only to matches in that limited list, never all pub.dev packages. The API's undocumented search endpoint is not used. Fixed-version inspection retains `archive_sha256` if supplied but does not download archives. Missing names can still be found through repository search or a later supported discovery source.

Hex uses `/api/packages?search=...&page=...&per_page=6&sort=downloads`. Search-selected stable versions stay fixed during inspection even if latest changes. The release's version and canonical package URL must match; separate package metadata is hashed at its mutable URL without a version ref. pub inspection selects latest only when discovery has no version, then checks the fixed endpoint's version and pubspec name/version. Neither reader follows publisher-supplied archive or arbitrary metadata URLs. GitHub/GitLab repository reads use fixed commits but keep release correspondence unverified without a proven source reference.

```powershell
node dist/src/cli.js check --project . --task '查找 Rust JSON 库' --query serde_json --ecosystem rust --json
node dist/src/cli.js check --project . --task '跨平台查找 JSON 实现' --query json --source gitlab --source crates --source maven --json
node dist/src/cli.js check --project . --task '核查 Eigen 仓库' --query https://gitlab.com/libeigen/eigen --source gitlab --json
```

The same MCP `check_reuse` input uses `sources: ["gitlab", "crates"]`. Existing MCP processes must reload the new build to expose the new schema. The four tool names and decision lifecycle are unchanged.

Source selection is part of cache/decision context. Local code is always searched freshly. Automatic routing of exact scoped npm names applies unless explicit sources override it. Remote workers are bounded at four under one overall deadline; queued sources receive explicit timeout results if their budget expires.

## Pagination and failure retention

`maxPages` defaults to **2**, with integer values **1–3** supported by core, MCP and CLI (`--max-pages`). Each source/query has its own cap; all jobs complete their first page before any continuation is started. Pages share the overall budget. Exact GitLab URL lookup and PyPI name verification do not paginate. The shortlist remains capped at 30, with at most eight local matches and source representatives; each source result retains its full deduplicated candidates.

```powershell
node dist/src/cli.js check --project . --task '分页查找 JSON 实现' --query json --source crates --max-pages 3 --json
```

| Source | Page control | Continuation signal |
|---|---|---|
| GitHub | `page`, `per_page=6` | `total_count`, otherwise full-page inference; `incomplete_results` stays partial |
| GitLab | `page`, `per_page=6`, `order_by=id`, `sort=asc` | Full-page inference; no header/cursor traversal |
| npm | `from=(page-1)*6`, `size=6` | `total`, otherwise full-page inference |
| crates.io | `page`, `per_page=6` | `meta.total`, otherwise full-page inference |
| Maven | `start=(page-1)*6`, `rows=6` | `response.numFound`, otherwise full-page inference |
| NuGet | `skip=(page-1)*6`, `take=6` | `totalHits`, otherwise full-page inference |
| RubyGems | `page`, fixed upstream size 30 | Full-page inference |
| Packagist | `page`, `per_page=6` | `total`, otherwise full-page inference; URLs are reconstructed on the official endpoint |
| Hex | `page`, `per_page=6`, `sort=downloads` | Full-page inference; no arbitrary continuation URL traversal |
| pub | Local slices of 6 from one validated, cached official name corpus | Count of matching corpus names; not remote page requests or all-registry totals |

After a successful page, `pagination` records `pageSize`, `pagesFetched` (successful reads), `itemsFetched` (before deduplication), optional `totalAvailable`, `hasMore` and `stopReason`. `hasMore` means reported or inferred remaining results, not a guarantee. Full pages without totals may require an empty terminal read. Totals/rankings are mutable, not a consistent snapshot; this implementation does not traverse upstream cursor or Link URLs. First-page failures retain their existing structured source error without successful-page progress.

`stopReason` is `exhausted` when the response indicates no continuation, `page_limit` when the configured finite plan ends, or `lookup` for an exact GitLab lookup. `page_limit` can coexist with successful source status and complete bounded-plan coverage. Later-page errors retain all previous candidates and successful-page progress, set `partial`, preserve the original error/status/Retry-After and `failedPage`, and stop with `error` or `budget`. A repeated nonempty page with no new IDs stops with `no_new_candidates`, partial coverage and an explicit note. Failed/partial plans are not cached. Successful bounded plans are cached with the page cap in their context, so a one-page cache cannot satisfy a two-page request.

## Transport and evidence policy

Optional `GITHUB_TOKEN` and `GITLAB_TOKEN` stay on their own hosts. The Codex installer forwards environment variable names, never literal tokens. Reads use HTTPS and an allowlist. Only NuGet redirects between its supported official global/regional hosts are followed, at most three per attempt within the same request deadline. Other redirects are rejected. Discovery never executes package or repository code.

Local discovery considers UTF-8 text with any file extension, including extensionless files. It excludes binary/non-UTF-8 files, symlinks, hidden/dependency/build directories and `.env` files. Limits are 1,200 scanned files, 180 KB per file, 30 raw matches, and 8 local shortlist entries. The root manifest fingerprint covers additional ecosystems and .NET project files; nested workspace manifests are not all fingerprinted.

## Official protocol references

- pub.dev [supported APIs and search guidance](https://pub.dev/help/api), [Hosted Pub Repository V2 specification](https://github.com/dart-lang/pub/blob/master/doc/repository-spec-v2.md).
- Hex [official API specification](https://github.com/hexpm/specifications/blob/main/apiary.apib), [search page/per_page implementation](https://github.com/hexpm/hexpm/blob/main/lib/hexpm_web/controllers/api/package_controller.ex).

- GitHub repository search and result limits: [Search API](https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28#search-repositories). npm size/offset search: [Registry API](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md#get-v1search).
- GitLab project filtering, search ordering and exact project lookup: [Projects API](https://docs.gitlab.com/api/projects/), [pagination](https://docs.gitlab.com/api/rest/#pagination). File content and commit references: [Repository files API](https://docs.gitlab.com/api/repository_files/).
- crates.io search: [Cargo registry web API](https://doc.rust-lang.org/cargo/reference/registry-web-api.html).
- Maven coordinate queries and result fields: [Maven Central REST API](https://central.sonatype.org/search/rest-api-guide/).
- NuGet endpoint discovery: [Service index](https://learn.microsoft.com/en-us/nuget/api/service-index), [search](https://learn.microsoft.com/en-us/nuget/api/search-query-service-resource), [package metadata](https://learn.microsoft.com/en-us/nuget/api/registration-base-url-resource), and [HTTP status behavior](https://learn.microsoft.com/en-us/nuget/api/overview).
- RubyGems search and exact version/platform metadata: [RubyGems.org API](https://guides.rubygems.org/rubygems-org-api/).
- Composer package search, full metadata and upstream cache behavior: [Packagist API](https://packagist.org/apidoc).

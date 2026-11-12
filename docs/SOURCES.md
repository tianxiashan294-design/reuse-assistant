# Source coverage

The long-term target is all programming languages and platforms. The current checkout implements the finite source set below, including unreleased changes. `coverage: complete` means the selected bounded plan completed. `sourcePlan` lists supported capabilities, limitations and selection state. `sources` retains actual requests and failures.

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
| Clojars | Official package metadata search | Fixed non-SNAPSHOT POM text and direct coordinates | 24 results/page, no inherited/interpolated coordinates, timestamped SNAPSHOT resolution or archive reads |
| Hackage | Official bounded name/synopsis/description search | Normal numeric version and SHA-256-verified fixed Cabal revision | 6 local results/page from a bounded upstream candidate pool, no archive or license file reads |
| MetaCPAN | Latest authorized released distribution search | Fixed author/release metadata and supplied checksum | 6 results/page, upstream partial signals retained, archive and repository correspondence unverified |
| Go module proxy (`goproxy`) | Explicit public module path and optional exact version | Fixed `.info` and `go.mod` with separate identity checks | Single lookup, no module search, archive, checksum database or repository correspondence |
| Conan Center Index (`conan`) | Literal recipe directory name match | Fixed `config.yml`, `conanfile.py` and `conandata.yml` from selected recipe folders | Six local matches per page. Live Conan remotes, description search and package revision verification are outside the index. |
| Microsoft vcpkg (`vcpkg`) | Literal port name match in the default baseline | Fixed baseline, matching port version record and port tree files | Six local matches per page. Custom registries, overlays and upstream source are outside the default baseline. |

Package evidence without a supported repository is explicitly partial. Missing README/license files, failed code reads, unknown SCM and unverified package/source correspondence remain visible. Packages in the same repository keep distinct aliases and versions. Repository identities include the hosting platform.

## Selection

### Explicit multilingual query plan

Core, MCP and CLI `--input` accept `queryVariants: [{ query, variants }]`. Each anchor must uniquely match an original query after trimming. Up to three originals and two variants per original produce at most nine unique execution queries. The host supplies translations or technical synonyms; the core never invents them. All originals run before variants; repeated execution strings are queried once, while public `queryPlan` retains every `{ query, origin, kind }` mapping. Variants share the same deadline, page/retry caps and source routing. Local discovery uses the same strings with its existing sixteen-token lexical limit. Supplied variants isolate the query cache and decision context.

```json
{"task":"查找定时任务实现","queries":["定时任务"],"queryVariants":[{"query":"定时任务","variants":["background scheduler","scheduled jobs"]}],"sources":["github","npm"]}
```

After repository/package deduplication, remote shortlist slots go to the available source with the fewest selected candidates; ties use the documented source catalog order. Each source's best lexical candidate is selected next. A merged repository credits all sources that returned it, and package aliases/versions remain attached. The shortlist keeps at most eight local candidates and thirty total; complete per-source lists remain public. This is a deterministic source-allocation policy, not learned relevance or exhaustive recall. Fixed examples are in `test/recall-scenarios.json` and run through the public core, CLI and real MCP stdio interfaces.

`ecosystem: auto` (default) selects all implemented sources. `javascript`, `python`, `rust`, `java`, `dotnet`, `ruby`, and `php` select GitHub + GitLab and the matching registry. `java` includes the JVM package ecosystem used by Kotlin and Scala. `go` selects GitHub, GitLab and `goproxy`. Explicit `sources` override ecosystem routing. `scope: local` performs no network requests.

`dart` / `flutter` select GitHub + GitLab + pub; `elixir` / `erlang` select GitHub + GitLab + Hex. These selections add retrieval ecosystems, not structural parsers for Dart or Elixir. Use `--source pub --source hex` or MCP `sources: ["pub", "hex"]` explicitly when desired.

`clojure`, `haskell` and `perl` select GitHub and GitLab plus Clojars, Hackage and MetaCPAN, respectively. Explicit source IDs are `clojars`, `hackage` and `metacpan`. These adapters expose package metadata. A MetaCPAN distribution can provide multiple importable modules.

### C and C++ package catalogs

`c` and `cpp` select GitHub and GitLab plus `conan` and `vcpkg`. Each catalog uses the official public GitHub repository and the shared GitHub HTTP quota. A check resolves one commit per catalog and shares the resulting snapshot across query variants and pages. Source results expose `catalogRevision` and the endpoint used. Lookup terms are matched locally as case-insensitive literal substrings of names, with six matches per page in name order. Totals refer to the returned snapshot. GitHub truncation or unread catalog entries remain visible.

```powershell
node dist/src/cli.js check --project . --task '查找 C/C++ 压缩库' --query zlib --source conan --source vcpkg --json
```

Conan Center discovery reads the nonrecursive `recipes` tree. Inspection retains the fixed recipe's `config.yml`, and `conanfile.py` and `conandata.yml` from up to three directories, with `all` first when present. Recipe version declarations remain text. Conan remotes, RREV, binaries and correspondence with upstream source remain unverified. [Conan Center Index](https://github.com/conan-io/conan-center-index). [Conan remote search](https://docs.conan.io/2/reference/commands/search.html).

vcpkg discovery reads `versions/baseline.json` at the fixed catalog commit. Inspection matches the baseline version and `port-version` in the pinned per-port version file. It reads the identified Git port tree's manifest or legacy `CONTROL`, and `portfile.cmake`. A display suffix like `#3` identifies a port revision. The port tree describes packaging, and upstream source correspondence remains unverified. [vcpkg registry layout](https://learn.microsoft.com/en-us/vcpkg/maintainers/registries).

### Explicit Go module verification

Pass up to three known **public** module coordinates via core/MCP `goModules: [{ path, version? }]`, CLI `--go-module path[@version]`, or CLI `--input` JSON. The full module path goes to `proxy.golang.org`. Supply it from public project or installation evidence. Without coordinates `goproxy` reports `skipped`. Functional queries and local manifests are never used to infer Go lookups.

```powershell
node dist/src/cli.js check --project . --task '核验 Go 模块' --query 'Go semantic versions' --source goproxy --go-module 'github.com/Masterminds/semver/v3@v3.2.1' --json
```

An omitted version uses the proxy's `@latest` response as a locator, then checks the fixed `.info`. Explicit versions require a canonical Go semantic version matching the module path's major suffix, including supported pseudo-versions and legacy `+incompatible` versions. Go case-encoding preserves case in paths and prereleases. The single lookup shares the existing deadline and retry policy. HTTP errors, including 404/410, remain in the source result with their status and endpoint. They describe only the requested public proxy response.

Inspection re-reads the exact version's `.info` and `.mod` independently and hashes each accepted text response. `versionVerified` confirms the fixed `.info` version. `modulePathVerified` confirms that the published `.mod` declares the exact supplied module path. Plain and simply quoted declarations are supported. The proxy can synthesize a `go.mod` for legacy modules. Origin fields in `.info` are retained as evidence without following their links. Inspections stay partial because archives, checksum database, repository correspondence, README and license files are outside this lookup. [Official Go proxy protocol](https://go.dev/ref/mod#goproxy-protocol).

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
| GitLab | `pagination=keyset`, `per_page=6`, `order_by=id`, `sort=asc` | Follow the checked official next Link/id_after; missing next means this bounded traversal ended |
| npm | `from=(page-1)*6`, `size=6` | `total`, otherwise full-page inference |
| crates.io | `page`, `per_page=6` | `meta.total`, otherwise full-page inference |
| Maven | `start=(page-1)*6`, `rows=6` | `response.numFound`, otherwise full-page inference |
| NuGet | `skip=(page-1)*6`, `take=6` | `totalHits`, otherwise full-page inference |
| RubyGems | `page`, fixed upstream size 30 | Full-page inference |
| Packagist | `page`, `per_page=6` | `total`, otherwise full-page inference; URLs are reconstructed on the official endpoint |
| Hex | `page`, `per_page=6`, `sort=downloads` | Full-page inference; no arbitrary continuation URL traversal |
| pub | Local slices of 6 from one validated, cached official name corpus | Count of matching corpus names; not remote page requests or all-registry totals |
| Clojars | `page`, fixed upstream size 24 | `total-hits` and validated `offset`, `count` and `results-per-page` |
| Hackage | Local slices of 6 from one successful search load per query | Count of names in the bounded returned pool. The upstream soft/hard bounds are 400/800 and the saturation signal preserves partial coverage |
| MetaCPAN | `from=(page-1)*6`, `size=6` | Exact total when supplied. Lower-bound totals, timeout and shard failure signals preserve partial coverage |

After a successful page, `pagination` records `pageSize`, `pagesFetched` (successful reads), `itemsFetched` (before deduplication), optional `totalAvailable`, `hasMore`, `mode` and `stopReason`. `hasMore` means reported or inferred remaining results, not a guarantee. Offset sources can require an empty terminal read; totals/rankings are mutable rather than a consistent snapshot. GitLab alone currently follows checked keyset Links, retaining the next URL publicly. Exact lookups do not paginate. First-page failures retain their structured source error without successful-page progress.

GitLab next links must preserve HTTPS `gitlab.com/api/v4/projects`, the original search, public visibility, size six and ascending-ID keyset ordering. The observed official false-valued defaults and `page=1` are allowed; unknown, credential, impersonation and privileged options are rejected without reflecting their values into public records. Ambiguous/malformed links stop with `invalid_continuation`; non-advancing cursors stop with `cursor_cycle`. Both keep the current page and return partial coverage without claiming exhaustion. A retry uses exactly the same continuation. This does not authorize arbitrary API URLs or hosts.

NuGet search recognizes compatible `SearchQueryService` aliases from the official service index, deduplicates up to eight allowed official HTTPS endpoints, and uses the second on the existing eligible source retry. A successful index load is shared across that source/query's pages and retries; a failed load can be attempted again. This pins endpoint ordering within the job and does not add another retry layer. `maxRetries: 0` disables switching. Authentication, limits, invalid data and positive Retry-After waits do not switch endpoints. `endpoint` on results/errors and failure history records the actual attempt, including recovered failures. The cache namespace changed for these discovery semantics; old decision context hashes remain readable.

`stopReason` is `exhausted` when the response indicates no continuation, `page_limit` when the configured finite plan ends, or `lookup` for an exact GitLab lookup. `page_limit` can coexist with successful source status and complete bounded-plan coverage. Unrecovered later-page errors retain all previous candidates and successful-page progress, set `partial`, preserve the final error/status/Retry-After and `failedPage`, and stop with `error` or `budget`. A repeated nonempty page with no new IDs stops with `no_new_candidates`, partial coverage and an explicit note. Failed/partial plans are not cached. Successful bounded plans are cached with the page cap and retry policy in their context, so a one-page cache cannot satisfy a two-page request.

## Bounded failed-source retries

`maxRetries` accepts **0 or 1**, defaulting to **1**, in core and MCP; CLI uses `--max-retries`. It applies to each failed source/query/page, including exact lookups. Every initial request in the current page round finishes before eligible failures are retried; retries finish before continuation pages begin. Initial and retry requests share the same overall deadline and maximum of four workers. Local discovery is not retried.

The scheduler retries network unavailability, request timeouts only while the overall budget remains, and HTTP 408 or 5xx. It does not retry authentication failures, rate limits, missing resources, invalid responses, resource-limit failures, partial results without an error or repeated pages. Any positive `retryAfterMs` prevents immediate replay, including when supplied by a 5xx response. The existing HTTP transport's single short throttling-wait retry is separate and unchanged; `maxRetries: 0` disables scheduler retries only.

Each source result can include `failures: [{ page, error, retry, retryError? }]`. `error` retains the original structured code/message/status/Retry-After. `retry` is `not_retried`, `recovered` or `failed`; a failed retry retains its own structured `retryError`. Recovery clears the current error but keeps the failure history, including in a successful result's cache. It does not remove unrelated partial-coverage flags. Successful page/item counts exclude failed attempts, and elapsed time includes them. A cached failure history describes the original cached request, not a new failure during the cache read.

For pub.dev, a rejected in-flight corpus load is cleared so an eligible retry can request it again; the independent eight-hour successful-corpus cache remains in force. Finite retry recovery does not establish endpoint reliability or exhaustive discovery. Offline interface checks, live endpoint observations and actual host loading are separate outcomes in [validation](VALIDATION.md).

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

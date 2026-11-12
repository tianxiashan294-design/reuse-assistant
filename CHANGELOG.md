# Changelog

## Unreleased

- Add Conan Center Index and Microsoft vcpkg name discovery from fixed GitHub catalog snapshots. Inspect recipe files or the default baseline port tree and preserve catalog, version, and upstream source boundaries.

- Verify known public Go modules through `goproxy` in the shared core, CLI and MCP. Preserve case-sensitive module/version identities, fixed `.info` and `go.mod` evidence, and explicit lookup, archive and source limits.
- Add Clojars, Hackage and MetaCPAN metadata discovery to the shared core and CLI/MCP ecosystem selection. Preserve bounded pages, upstream partial results and fixed POM, Cabal revision or author/release evidence. Keep package archives and unproven source correspondence explicit in inspection gaps.

- Add checked GitLab keyset/Link traversal and compatible official NuGet search-endpoint fallback within the existing source retry. Retain actual endpoint provenance, malformed/cyclic cursor gaps and successful pages; preserve the bounded transport interfaces and old decision hashes while isolating old discovery caches.

- Add bounded host-provided multilingual query variants with public origin mappings and cache isolation. Allocate shortlist slots to the least represented available source, retaining lexical ordering, merged repository/package identities and fixed recall samples exercised through core/CLI/MCP.

- Retry transient discovery failures once per source/query/page by default, after the page round's initial requests and before continuations, under the same deadline and four-worker limit. Expose `maxRetries: 0|1` through core/MCP and `--max-retries` through CLI; isolate cached plans by retry policy.
- Preserve original page failures and retry outcomes in public results and cached recovered results. Retry network unavailability, live-budget timeouts and HTTP 408/5xx; skip authentication, throttling, invalid data and positive `Retry-After` waits. Existing transport-level short throttling retries remain separate.
- Clear rejected pub.dev corpus loads so eligible retries perform a fresh read while retaining the independent eight-hour corpus cache. Validation and host activation remain separately reported.

## 1.1.0 — 2026-11-05

- Support automatic OpenCode setup, diagnosis and selective removal using a single existing `opencode.json` or `opencode.jsonc`, including comments and trailing commas. Default new projects to `opencode.json`.
- Preserve unrelated settings and comments with structured edits; keep repeated initialization unchanged. Reject duplicate keys, ambiguous two-file configurations and receipt/path mismatches before writes. Retain modified managed entries and compatible v1 receipts.
- Adopt unmodified MIT `jsonc-parser@3.3.1` with fixed artifact integrity and original notice. Keep discovery/evidence/decisions in the shared core and retain existing client and guard boundaries.
- Add public CLI lifecycle/error/ownership tests and actual generated JSONC stdio MCP verification; distinguish offline checks from real host activation.

## 1.0.0 — 2026-11-04

- Add explicit `--client codex|claude-code|opencode|deepseek-harness` to project init, doctor and uninstall; preserve Codex as the default.
- Generate native Claude/OpenCode MCP configuration, independent skill bundles and project workflow pointers. Generate an explicit DeepSeek Cordis MCP overlay without modifying global profiles.
- Preserve unrelated configuration and instructions; preflight malformed/conflicting inputs, track per-client ownership and retain user-modified content on uninstall. Automatic OpenCode setup supports strict JSON; JSONC remains manual.
- Keep discovery, evidence, alignment and decision records in the shared core. New clients use MCP/skills/instructions; automatic patch guards remain Codex-only. Publish capabilities and host validation limits explicitly.
- Test native launch commands through the public CLI and actual stdio MCP SDK, including all four tools and linked decision stages. No new runtime dependency or copied upstream code.

## 0.8.0 — 2026-11-04

- Add PHP, Ruby, Kotlin, Swift, Bash and Lua structural evidence through the existing shared core, with six unmodified upstream release WASM assets, fixed revisions/hashes and original MIT licenses. No runtime dependency or toolchain is added.
- Preserve declaration/parent ranges, Unicode hashes, bounded calls/control/write facts and unsupported imports. Handle grouped PHP use, literal/dynamic loads, Kotlin/Swift imports and Bash source; all foreign call targets remain unresolved. Invalid/excerpted code and budgets retain public gaps.
- Share code-path recognition between inspection and adaptation decisions, including new extensions and previously omitted C/C++/Swift code. Add public core, actual MCP stdio, CLI, failure/limit and adaptation-gate tests. Dart remains text evidence; registry-source coverage is unchanged.

## 0.7.0 — 2026-11-04

- Add Java, C#, C and C++ structural evidence using four fixed official WASM assets: declarations/parents, precise hashes/ranges, imports/includes and bounded syntax facts. Retain explicit header ambiguity, preprocessor and unresolved-target gaps.
- Add Hex package name/description search, bounded pagination and fixed release metadata/checksum inspection. Preserve mutable package links/licenses as separate hashed evidence.
- Add pub.dev official limited name-corpus matching and fixed-version pubspec/archive-hash metadata. Expose `name_search` limits and an independent persistent eight-hour corpus cache; no undocumented full-text search or archive execution.
- Expose pub/hex sources and dart/flutter/elixir/erlang routing through shared core, CLI and MCP. Retain all previous source behavior, failures/budgets and existing grammar versions. Add public-interface tests and a separate `smoke:v7` live observation with retained history.

## 0.6.0 — 2026-11-04

- Add Python, Go and Rust structure evidence in the shared inspection core: declarations/parents, UTF-16 ranges and hashes, imports and bounded syntactic calls, control counts and write targets.
- Adopt unmodified `web-tree-sitter@0.27.1` and three pinned official WASM release assets with original MIT notices, commit references and SHA-256 manifests. No native toolchain or runtime network fetch is required.
- Keep JS/TS Babel segment identities and definition links. New-language imports/calls retain unsupported/unresolved reasons; dynamic Python loading, Rust macro/attribute expansion and out-of-line modules expose gaps. Errors and excerpts fall back to text.
- Share the existing byte/node/segment/call budgets, preserve alignment blockers and incomplete-context acknowledgment, and add public core, CLI and real stdio MCP regression coverage. Registry and hosting-platform coverage is unchanged.

## 0.5.0 — 2026-11-04

- Add bounded, inspection-only JS/TS definition links for relative imports, explicit named/default reexports and stable top-level direct calls, reusing the existing fixed parser without new dependencies.
- Preserve unresolved reasons for module ambiguity, partial/duplicate evidence, shadowing, reassignment, dynamic scope/dispatch, packages and reexport cycles. Limit links to 300 calls and 10 reexport hops; never expand file/network reads automatically.
- Require selected resolved callees and intervening modules during alignment. Return incoming/outgoing call context in the shared prompt; propagate incomplete linkage into assessment gaps and the existing acknowledgment gate. Unknown/conflicting requirements remain blockers.
- Retain old records without linkage, method names, source behavior and syntax hashes. Reinspecting old evidence supplies linkage; old evidence assessed anew reports the missing context. No language registry, hosting platform or runtime dependency was added.

## 0.4.0 — 2026-11-03

- Add bounded, static JS/TS/JSX/TSX AST segments, exact hashes/ranges, parent context, syntactic calls/control/write facts and import edges to inspection. Other languages and incomplete reads retain explicit gaps.
- Add whole-task alignment contracts and core/MCP/CLI assessment. Validate every original task/constraint requirement, segment provenance, parent selection, forbidden dependencies, baseline alternatives and integration plans before an opted-in decision.
- Recheck local evidence before planning; bind assessment strategy/candidates/evidence and keep the same report through lifecycle transitions. Semantic judgments and validation remain host-reported, not global optimality proofs.
- Distribute task-specific prompts and the updated reuse skill/reference through the installer. Preserve legacy checks without contracts and all v0.3 pagination work.
- Adopt unmodified `@babel/parser@7.28.5` with fixed lockfile provenance and notices. No language registry or hosting platform was added.

## 0.3.0 — 2026-10-29

- Add bounded pagination to all eight discovery sources in the shared core, CLI (`--max-pages`) and MCP (`maxPages`); default two pages, maximum three under the existing total deadline.
- Schedule every first-page job before continuations with at most four workers. GitLab search uses ascending project ID for stable paging; RubyGems retains complete fixed-size 30-item pages.
- Preserve earlier candidates and structured errors when later pages fail; deduplicate candidate IDs and stop repeated pages with explicit partial coverage.
- Expose page counts, item counts, optional reported totals, remaining-result signals and stop reasons in JSON and Markdown. Isolate caches by page cap and exclude failed/partial searches.
- Add deterministic public core, CLI and real MCP pagination tests plus a separate live endpoint observation command with retained history. No new dependency or copied upstream implementation.

## 0.2.0 — 2026-10-27

- Add GitLab.com, crates.io, Maven Central, NuGet.org, RubyGems and Packagist discovery in the shared core.
- Add ecosystem and explicit source selection to core, CLI and MCP, with public capability/coverage plans and source-aware caching.
- Read GitLab evidence at fixed commits, new registry version metadata, Maven POMs and Packagist source references; retain missing evidence and failed requests.
- Search local UTF-8 text independently of programming-language file extensions and expand root dependency manifest fingerprints.
- Handle official NuGet regional redirects with bounded host checks; isolate platform credentials and forward optional GitLab credentials in generated configuration.
- Fix cancellation of queued source requests after the global deadline; retain a representative for each returning source in the shortlist.
- Add public core and real MCP regression coverage plus a separate live observation command. See [validation](docs/VALIDATION.md), [source limits](docs/SOURCES.md) and the [long-term roadmap](docs/ROADMAP.md).

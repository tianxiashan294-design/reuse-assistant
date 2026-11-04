# Validation record

## v1.0 local verification — 2026-11-04 (Asia/Shanghai)

Environment: Windows PowerShell, Node v24.15.0. Added Claude Code, OpenCode and official DeepSeek Harness setup/doctor/uninstall through explicit CLI client selection; default Codex and shared discovery/evidence/alignment/decision behavior remain. Package, lockfile, CLI help and MCP server identity report `1.0.0`. No new dependency or copied upstream implementation was incorporated.

### Offline public-interface checks

`npm run check`, `npm test` and `git diff --check` pass. **123/123** tests pass: 108 existing and 15 new client cases. New tests invoke the compiled public CLI to cover native config/skill/reference/instruction generation, idempotence, unrelated config preservation, unmanaged collisions, malformed config, modified managed content, selective uninstall, coexistence with Codex, invalid client/options/hooks, JSONC refusal, runtime token references without credential snapshots and junction confinement before writes. Paths include Chinese characters, spaces and shell metacharacters.

For each new client, tests read its generated native server command and start the actual server with the official SDK stdio transport. They list the four tools, run check/inspect/assess/decide, link planned → applied → verified, and read the same latest decision through CLI. These are offline SDK/configuration tests, not executions inside Claude Code, OpenCode or DeepSeek Harness. A focused test run initially failed during Windows fixture cleanup because the MCP process still held its working directory. Closing it in `finally` before fixture cleanup corrected the test lifecycle; the subsequent full suite passes without forcing process exit.

`npm pack --ignore-scripts --dry-run --json` reports `reuse-assistant-local-1.0.0.tgz`, 127 entries, with the new adapter source/build outputs, client guide and installed skill references. This is a package-content check, not npm publication or an installed production-host run.

### Official compatibility reads and discovery limits

Official Claude/OpenCode configuration and skill docs were read. DeepSeek's explicit overlay, MCP entry and filesystem-skill contracts were checked against revision `8bd073392eef6f54e921a093b95076248eb08cbb`; links and process/project scope limits are retained in [CLIENTS.md](CLIENTS.md). These are live documentation reads, not model compliance or host activation tests. No new search-endpoint smoke was run because discovery sources and transport behavior are unchanged; prior endpoint observations below remain historical.

Reuse check `125c5ba4-9cd0-4625-8b96-91625bf0d4a2` inspected existing installer, CLI, hook, core and project context. Ready alignment `a84045f1-6298-48f5-bd10-3bb3808c1dd6` preceded planned decision `aad566ba-0d80-4f86-92ad-d81494921436`. Bounded local/npm coverage and unresolved static dependencies were acknowledged rather than treated as complete. `agent-install@0.0.8` had only registry metadata and no supported source association, so it was not adopted. A separate attempted JSONC-parser evaluation encountered unavailable npm discovery and GitHub pinned-evidence HTTP 403, including the CLI retry; no dependency was adopted on incomplete source context. OpenCode JSONC is explicitly manual, preserving user files on automatic setup refusal.

### Host and release boundaries

New clients provide MCP, skill and project workflow instructions; they do not implement automatic patch guards or turn bindings. DeepSeek requires an explicit `--patch` launch and binds one server/project across its process. `doctor` reports filesystem/expected-command state, not runtime activation. Actual Claude Code/OpenCode/DeepSeek sessions, Codex desktop reload, host trust, Node 22/Linux/macOS runs, remote CI, push/tag/release and npm publication were not performed. Existing unrelated RSS example and notice changes were preserved.

## v0.8 local verification — 2026-11-04 (Asia/Shanghai)

Environment: Windows PowerShell, Node v24.15.0. Add PHP/Ruby/Kotlin/Swift/Bash/Lua syntax mappings and six fixed upstream WASM release assets in the existing shared core. No runtime dependency or target-language toolchain is added; registry retrieval behavior is unchanged.

### Offline public-interface checks

`npm run check`, `npm test` and `git diff --check` pass; **108/108** tests pass (103 previous plus five new public-interface cases). New cases cover all six languages through public core inspection, compiled CLI and actual SDK stdio MCP: exact Unicode/emoji/CRLF offsets and hashes, nearest declaration/module parents, calls/writes/branches/returns, import/load facts, forbidden dependencies, unknown requirement and missing parent blockers, acknowledged partial-context decisions, invalid/excerpted syntax, dynamic loading, segment/call limits, nested functions/closures, grouped PHP use, Kotlin wildcard imports, Swift member imports and Bash heredocs. Fixed licensed remote fixtures verify that Swift/Bash/Lua code evidence passes the public adaptation gate using shared code-path recognition. These remote fixtures use injected transport and are offline tests.

The initial focused run caught a missing `planned` status in the test decision. A nested Kotlin fixture also exposed the fixed upstream grammar's missing class-member separator for a compact same-line layout; a multiline fixture verifies supported syntax, while unsupported layouts remain conservative text fallback. The first full regression run passed 107/108: a historical fallback case still expected Lua to be unsupported. That case now uses Haskell, and the existing Kotlin fallback fixture now uses Dart. The corrected full suite passes; neither fallback expectation was removed.

### Live asset retrieval and provenance

All six upstream release WASM files were downloaded, hashed and loaded with the existing runtime. PHP/Swift/Bash/Lua hashes match the GitHub release metadata digests observed during retrieval; Ruby/Kotlin have no published digests. Revisions were resolved directly at fixed Git tags; original licenses and node-type descriptions were read from those pinned revisions using partial Git clones. API/raw/CDN retrieval attempts encountered connection resets/timeouts and later HTTP 403 responses; fixed-tag Git reads and completed release downloads supplied the final evidence. Interrupted downloads were never accepted as valid assets. The manifest records all final URLs/revisions/hashes/ABIs; original full MIT licenses ship beside the files. Published tag/binary identity is not an independent reproducible-build proof.

No new registry endpoint smoke was necessary for this structural-only change, and no exhaustive language/version conformance or model semantic behavior is claimed. Dart's inspected upstream returned no latest release artifact; it remains text evidence, rather than adopting the inspected third-party bundle with broader provenance. Structural complete and foreign linkage partial remain distinct.

### Installed artifact and host boundaries

`npm pack --ignore-scripts --pack-destination .reuse-assistant/package-v8-smoke --json` produced a 122-entry archive, including all thirteen WASM grammars, their licenses and the manifest (27 grammar-directory entries). Installing it with `--omit=dev --ignore-scripts` and running `node .reuse-assistant/package-v8-smoke/smoke.mjs` passes all thirteen grammars plus Babel through the installed public core; no development TypeScript compiler is present. Installed CLI reports `0.8.0`. Installation fetched normal npm dependencies; the grammar smoke itself runs offline.

The existing dirty workspace changes and earlier validation histories remain intact. This record reports local code, CLI/MCP subprocess and installed-artifact outcomes. It does not claim npm publication, remote CI, other operating systems, desktop MCP restart/reload, full project module resolution or a runtime call graph. An already-running MCP process must reload the new build to expose the added structural support.

## v0.7 local verification — 2026-11-04 (Asia/Shanghai)

Environment: Windows PowerShell, Node v24.15.0. This update extends v0.6 in two directions: Java/C#/C/C++ structural evidence and pub.dev/Hex registry retrieval. All logic remains in shared core modules with CLI/MCP adapters. Existing Babel and Python/Go/Rust versions and the unrelated RSS example are retained.

### Offline public-interface checks

`npm run check`, `npm test` and `git diff --check` pass. **103/103** tests pass (96 previous, 6 new v0.7 cases and the existing pagination matrix expanded to Hex). Public core cases cover four-language declarations/parent chains, Unicode/emoji/CRLF ranges and hashes, calls/updates/branches/imports/includes, no false declarations in comments/strings, C# nested calls under unary operators, new-language unresolved links and forbidden dependency rules, invalid/excerpted syntax, `.h` ambiguity, preprocessing and shared segment budgets. Existing three-language and JS/TS suites still pass.

Registry cases verify Hex three-page recall and later-page failure retention; pub local corpus pages/totals/exhaustion and explicit limited-name scope; persistent eight-hour corpus caching across core instances, expiry and independence from `useCache: false`; underscore-prefixed pub names; stable version preservation when latest changes; fixed name/version/URL checks; separate mutable Hex package metadata without a version ref; malformed results, Retry-After, untrusted archive URLs and credential isolation. Actual compiled CLI and SDK stdio MCP tests expose the new source/ecosystem schema, four-language structure evidence, both registry inspections and acknowledged partial-evidence decisions. No model behavior or complete compiler/call-graph conformance is claimed.

### Real public endpoints and retained failures

`node dist/test/live-smoke-v7.js` ran **15:48:30–15:48:35** (Asia/Shanghai). Hex search returned 12 candidates over two pages and selected fixed `jason@1.4.5`; release metadata/checksum plus separate package metadata and associated repository documents were read. Repository HEAD is pinned but its correspondence to that release remains unverified. pub's first name-corpus validation rejected legitimate underscore-prefixed names, so the run exited 1. The original `invalid_response` remains in [live-smoke-v7.json](live-smoke-v7.json).

The validator and cache guard were corrected to accept leading underscores, and a regression corpus includes `_flutterfire_internals`. `node dist/test/live-smoke-v7.js pub` ran **15:49:21–15:49:23**, exited 0, returned 12 bounded name matches over two local slices and read fixed `http@1.6.0` metadata/archive hash. Its repository URL points into a monorepo path unsupported by the current association parser, and no archive/license extraction was performed; that inspection is explicitly partial. Both new sources therefore have successful individual observations across the retained runs. These are finite endpoint samples, not exhaustive corpus/description search, a recall benchmark or an archive/release source equivalence proof. pub uses only the official limited completion corpus; no undocumented full-text search endpoint is used.

### Assets, packaging and host boundaries

Four fixed official WASM release assets were loaded: Java/C++ ABI 14, C#/C ABI 15. Their release tags match recorded npm gitHead revisions; C# also matches the published GitHub SHA-256 digest. The other three releases lack published digests, so downloaded artifact hashes are retained in the manifest. API asset/body timeouts were encountered during retrieval; an interrupted C# artifact caused the first structural test failure and the manifest test initially lacked the final entries. Resuming the official download completed it, then digest/load/manifest checks and the full suite passed. Those intermediate failures are not claimed as valid grammar coverage. Complete original MIT licenses ship beside every asset; no upstream grammar/native build scripts were executed or added as dependencies.

A real `npm pack --ignore-scripts --pack-destination .reuse-assistant/upstream-v7 --json` archive has 110 entries and was installed in `.reuse-assistant/package-v7-smoke/consumer` with `--omit=dev --ignore-scripts`. `node .reuse-assistant/package-v7-smoke/smoke.mjs` passes all seven installed WASM grammars through public core inspection, plus pub/Hex discovery and pinned-version evidence with deterministic injected transport. No development TypeScript compiler is present. This production-only installation test is offline and separate from the real endpoint observations above.

Reuse check `be9530a0-c54c-4b4c-9a5e-734793c965dd` read existing analyzer/core/registry/transport/pagination/inspection context and pinned official Java grammar evidence. The earlier task wording was refined after official pub documentation showed no supported full-text search API. Final ready alignment `3d0d39cf-aae2-4bcb-bed5-1de63a3af96d` precedes planned decision `0895c80d-1392-4d3e-b965-bec76865bc61`; applied `468b550f-ab53-40b4-80d6-5f4c37631fb0` and its linked verified record preserve incomplete local/search/dependency coverage. Judgment and validation records are host-reported. No v0.7 remote CI, push/publication, Node 22/Linux/macOS execution or current desktop MCP reload is claimed. Running services must restart to load the new schema and implementation; stdio tests launch the new build directly. Shell writes remain outside the declared patch guard.

## v0.6 local verification — 2026-11-04 (Asia/Shanghai)

Environment: Windows PowerShell, Node v24.15.0. This update adds Python/Go/Rust structural evidence to the shared core with fixed WASM grammars. JS/TS keeps its Babel parser and definition linker. Package registries and hosting coverage are unchanged; the existing RSS example edits are retained.

### Offline public-interface checks

`npm run check`, `npm test` and `git diff --check` pass. **96/96** tests pass (90 previous and 6 new). Added tests use public `ReuseAssistant.check/inspect/assess/decide`, the compiled CLI and an actual MCP SDK stdio client/server. They cover three-language declarations and nesting, decorated Python ranges, Go methods/types/aliases, Rust traits/impl/union/closures, exact Unicode/emoji/CRLF offsets/line ranges/hashes, false declarations in strings/comments, import and call/control/write facts, stable inspection IDs, unknown foreign module/call targets, parent-context and unknown-requirement blockers, forbidden import prefixes in all three languages, acknowledgment gating, invalid syntax, excerpts, shared byte/node/segment/call budgets, dynamic Python loading and Rust macro/out-of-line module gaps. Assets are checked against the shipped SHA-256 manifest and original licenses.

These are bounded syntax/evidence tests, not compiler execution, a complete call graph, exhaustive language conformance or a model semantic benchmark. New-language structural completeness is distinct from its deliberately partial definition linkage. Supported claims and decision validation statements remain host-reported.

### Packaging and production-only consumption

A real `npm pack --ignore-scripts --pack-destination .reuse-assistant/upstream --json` archive has 101 entries, including the new source/compiled module and all three WASM files, manifest and licenses. The built 0.6.0 archive was installed in `.reuse-assistant/package-v6-smoke/consumer` with `--omit=dev --ignore-scripts`. `node .reuse-assistant/package-v6-smoke/smoke.mjs` passes the installed public core check → three-language inspect → ready assessment → planned decision. The consumer has no TypeScript development compiler. A fresh subprocess with its installed Go grammar temporarily absent returns text evidence and a visible ENOENT gap; the asset is restored afterward. No runtime network fetch or language/native toolchain is involved.

### Real artifact retrieval and host boundaries

GitHub/npm bounded discovery returned results; local match limits and incomplete dependency/linkage evidence were explicitly acknowledged. Initial check `2358e75f-0159-4bbf-b3a8-aa2bb755bdaf` inspected local architecture, `web-tree-sitter` and `tree-sitter-wasms`. The latter's 0.1.13 prebuilt assets failed to load with the new runtime due to the old dylink format and were rejected. Official 0.25.0 Python/Go and 0.24.0 Rust release WASMs replaced them. Direct github.com downloads encountered ECONNRESET/connect/body timeouts; the GitHub release-assets API subsequently supplied the missing artifacts. The final three assets load successfully with ABI 15. Python/Go hashes match official release digests; Rust's release has no published digest and its locally computed hash is retained. Official release tag commits match the recorded fixed revisions; no independent binary rebuild is claimed. This was artifact retrieval, not a new registry recall/live-smoke check.

After installing the dependency, check `9e9795e2-dd58-4716-8270-c47c4c3707a3` refreshed the dependency fingerprint and re-read local/core, runtime source/module context and official Python grammar evidence. Ready alignment `e6763d97-4d50-4f51-8966-7c1ec8fec497` precedes planned decision `e972ace1-5c12-4498-8620-c089c732aaa6`; linked applied/verified records remain in `.reuse-assistant/`. Only the selected bounded sources were queried. No v0.6 remote CI, publication, Linux/macOS or Node 22 execution, model behavior benchmark, or live desktop MCP reload is claimed. Running MCP processes must restart to load the new build; stdio tests launch the new build directly. Shell writes remain outside the patch guard.

## v0.5 local verification — 2026-11-04 (Asia/Shanghai)

Environment: Windows PowerShell, Node v24.15.0. This update extends v0.4 with conservative, inspection-only cross-file definition links and callee-context confirmation. It adds no language source, hosting platform or runtime dependency. The existing fixed `@babel/parser@7.28.5`, core interfaces, syntax hashes and unrelated RSS example changes are retained.

### Offline public-interface checks

`npm run check`, `npm test` and `git diff --check` pass. **90/90** tests pass (72 previous, 18 new). The added public-core cases cover named/default import aliases, explicit reexports, extension substitution and index files; callee and intervening-module closure; incoming caller context; actual target-path forbidden-import rules; dependency hash staleness; parameter/block/destructuring/catch/loop/name shadowing; direct/destructured/loop writes; mutable declarations; dynamic eval scope; recursion; type-only, namespace, member, external and export-star unknowns; missing/ambiguous/invalid/excerpted/duplicate evidence; reexport cycles; and AST/call budgets. The existing compiled CLI and real MCP SDK stdio workflows now also assert a resolved cross-file call; the MCP workflow rejects missing callee selection before completing assessment and decision.

Unresolved calls and the 300-call cap propagate from linkage into assessment gaps and the acknowledgment gate. An acknowledgment never overrides missing known callees or unknown/conflicting requirements. Structural coverage and linkage coverage are distinct. Supported requirement claims in fixtures remain host reports; no model semantic benchmark, complete lexical resolver or runtime call graph is claimed.

### Packaging

`npm pack --dry-run --json` includes `src/linking.ts`, its compiled runtime and declarations; the package has 90 entries. A real 0.5.0 tarball was installed into `.reuse-assistant/package-v5-smoke/consumer` with `--omit=dev --ignore-scripts`. `node .reuse-assistant/package-v5-smoke/smoke.mjs` passes the installed public core check -> inspect -> blocked incomplete callee selection -> ready complete selection -> planned decision. The consumer has no development TypeScript compiler. This validates the locally installed package, not remote publication or desktop activation.

### Discovery evidence and host boundaries

The current hook binding was included in both full reuse checks. Initial check `f060a60b-5e56-44b8-9453-0bbec9b3a307` retained a local search limit. Refined check `1ac52e46-137f-4061-900b-f50cff49ed31` retained GitHub HTTP 422 for the scoped package query; npm and the other GitHub query returned results. Only the selected bounded GitHub/npm plans were queried; this was not an ecosystem-wide recall test or a new registry live smoke.

Inspected existing segments/types/alignment/core/package evidence `1665bb83-9bcc-42da-bc6f-ed3dcb53a4cf` and Babel Traverse candidate evidence `baa00dfa-e2c4-4281-8726-b5388488ed7e`, including binding code, scope context and metadata. The large upstream scope file was excerpted and downstream local context was incomplete; those limits were explicitly acknowledged. Traverse 8.1.0 was rejected because its narrower Node minor requirement conflicts with this project's `>=22` contract and full scope machinery exceeds the selected bounded approach. The selected implementation extends local core code; no upstream implementation was copied and no new notice is required. The official [Babel Traverse documentation](https://babeljs.io/docs/babel-traverse) was read as reference, not executed instructions.

Ready alignment `11d00a63-a686-433e-a782-3b16a8dcd235` preceded planned decision `ce8ef7ae-493e-489a-a127-b7ff5f917a67`. Linked applied/verified records remain in `.reuse-assistant/`; verification statements there are host-reported. No v0.5 remote CI, GitHub push/release, macOS/Linux execution or live desktop MCP reload is claimed. A running v0.4 server must restart to load the new core; the stdio tests start v0.5 directly. Shell writes remain outside the hook's declared patch guard.

## GitHub publication checks - 2026-11-04 (Asia/Shanghai)

Initial publication exposed a Node 22 test-fixture failure on both Windows and Linux: a deliberately never-settling transport left no live event-loop handle for the unref'ed AbortSignal deadline. The existing core deadline fixture already handles this case. Both pagination hang fixtures now use the same scoped keep-alive timer with cleanup and a bounded test timeout. Production code and all deadline/candidate-retention assertions are unchanged.

After this correction, local Windows Node 22.23.4 and Node 24.15.0 each pass **72/72** tests. The Node 22 executable directory is first on PATH so generated real-shell hooks use the same runtime. The original failing and follow-up GitHub runs remain visible in [Actions](https://github.com/tianxiashan294-design/reuse-assistant/actions); local success alone is not the remote matrix result.

## v0.4 local verification — 2026-11-03 (Asia/Shanghai)

Environment: Windows PowerShell, Node v24.15.0. This update adds code segmentation and whole-task alignment; it adds no language registry or hosting platform. Existing v0.3 work and the RSS example are preserved.

### Offline public-interface checks

`npm run check`, `npm test` and `git diff --check` pass. The suite has **72/72** passing tests (58 existing, 14 new), including the actual compiled CLI and MCP SDK client/server over stdio. The new cases cover exact AST/hash/CRLF ranges and parent chains; comments/strings/regex not becoming declarations; controls/imports and no source execution; unsupported languages, parse failures, partial ranges, same-length excerpt identities, dynamic imports and bounded analysis; every original task/constraint requirement; missing/conflicting global requirements despite locally supported code; deterministic forbidden dependencies; invented/mismatched references; context hashes, local evidence staleness, preserved lifecycle assessment IDs and serialized assessment persistence. The installed skill's referenced files are also read during the existing installation test. Semantic supported claims and final validation statements in these fixtures are host reports, not independent proofs.

`python -X utf8 C:/Users/16219/.codex/skills/.system/skill-creator/scripts/quick_validate.py C:/reuse_assistant/skills/reuse-first` passes. This checks skill structure, not actual model behavior.

### Packaging and production-only installation

`npm pack --dry-run --json` succeeds and includes the new source, compiled modules/declarations, alignment documentation and skill reference. An actual 0.4.0 tarball was installed in `.reuse-assistant/package-v4-smoke/consumer` using `--omit=dev --ignore-scripts`. Running `node .reuse-assistant/package-v4-smoke/smoke.mjs` succeeds: the packaged core performs local check -> inspect (two AST segments) -> assess (ready) -> planned decision, then installs the skill including its alignment reference. The development TypeScript compiler is absent from that consumer; the runtime parser is 7.28.5. This is a local fixture/installation observation, not live desktop MCP activation. Smoke check ID: `20d2bebe-b229-4d20-b3ba-451754c6f33e`; planned decision: `0137ebe9-9794-4497-8273-e707c7eb3c5a`.

### Live endpoint evidence and remaining limits

Reuse discovery queried GitHub/npm/GitLab. GitLab returned an unavailable error, earlier local discovery reached a match limit, and GitHub candidate source reads returned HTTP 403; these failures remain in the original check/inspection records and were explicitly acknowledged. The official Babel parser documentation and npm metadata were read. `npm view @babel/parser@7.28.5 ... --json` confirmed the fixed version, MIT license, Node compatibility and artifact integrity; installation supplied the original license. The discovered latest parser 8.1.0 was rejected for its narrower Node minor requirements. No successful pinned GitHub code read is claimed. Attribution and modifications (none) are in `THIRD_PARTY_NOTICES.md`.

No new registry-adapter live smoke, remote CI matrix, npm publication, macOS execution or desktop MCP reload is claimed. A running older MCP server must reload the compiled 0.4 server to expose `alignment` and `assess_alignment`. The 72 tests demonstrate deterministic checks through the public interfaces; they do not establish a model's semantic reliability, resolved cross-file call graph, end-to-end system performance improvement or global optimality. JS/TS structural analysis and explicit other-language fallback are distinct from the seven language ecosystems' discovery coverage. Historical calls without alignment contracts retain their old behavior; the updated skill supplies contracts for substantial work.

The Codex hook's task prompt now requests the alignment contract/assessment for substantial work and points older MCP processes to the CLI fallback. `node dist/src/cli.js init --project C:/reuse_assistant --hooks` refreshed this checkout's existing managed configuration/skill/hooks; the installed skill also passes quick validation. This is a filesystem installation result, not a claim that the running desktop MCP reloaded. The final 72-test run passed after that hook prompt change.

Reuse records: original local-core evidence `4d8d0f18-9548-448b-8969-f727c6a21e6e`; parser-selection check `587293f1-d4f6-4724-bc53-65a5041c72e0`; candidate metadata evidence `3a54ad50-45f8-4863-9b6c-1c141ee6f18f`; planned decision `fc81075a-9334-4479-bf9a-104c173c4430`. Applied/verified records are linked in `.reuse-assistant/`; their validation statements are host-reported. No new upstream implementation was copied.

## v0.3 local verification — 2026-10-29 (Asia/Shanghai)

Environment: Windows PowerShell, Node v24.15.0, npm 11.12.1. This update adds bounded pagination to the existing eight discovery sources; it does not add a language registry or hosting platform.

`npm run check`, `npm test` and `git diff --check` pass. The deterministic suite has **58/58** passing tests (40 existing, 18 new). The added cases use the public `ReuseAssistant.check/inspect/decide` interfaces, the compiled CLI and a real SDK client/server over MCP stdio with injected endpoint fixtures. They verify source-specific page/offset parameters and second-page recall; three-page exhaustion; all-first-pages scheduling with four workers; page cap/cache isolation; local and exact-lookup behavior; continuation throttling and deadline retention; overlapping/repeated pages; malformed pages; persistent partial flags; and parameter bounds. The MCP test inspects a second-page package and traverses the planned/applied/verified protocol; its validation statement is explicitly a host-reported fixture claim, not a package installation.

`npm pack --dry-run --json` passes and includes `src/pagination.ts`, compiled JavaScript/declarations and the updated documentation. No runtime dependency was added. The previous third-party notices and the user's local RSS example changes are retained.

### Real public endpoint observations

`npm run smoke:v3` ran from **22:22:08 to 22:22:29** (Asia/Shanghai). GitLab, npm, crates.io, Maven Central, NuGet, RubyGems and Packagist each returned two successful pages for `json`. GitHub returned HTTP 403 with rate-limit evidence, so that full run correctly exited **1**. The original failure remains in [live-smoke-v3.json](live-smoke-v3.json).

After the reported cooldown, `node dist/test/live-smoke-v3.js github` ran from **22:23:22 to 22:23:23**, exited **0**, and returned two GitHub pages. Across these two runs, all eight sources have successful two-page observations. Each returned 12 distinct source candidates except RubyGems, which returned 60 (its fixed 30-item pages). All successful observations stopped at `page_limit` with `hasMore: true`, explicitly retaining unqueried scope. These are individual HTTP samples, not a recall benchmark, exhaustive collection or reliability guarantee. This run did not repeat v0.2 release-code inspection.

### Host and reuse workflow boundaries

No v0.3 remote CI matrix, npm publication, macOS execution or new desktop MCP reload is claimed. Running desktop MCP processes must reload the compiled v0.3 server to expose `maxPages`; the stdio tests launch the new server directly. The host supplied a current session/turn binding for this task, which was included in its reuse check. Shell writes remain outside the declared patch guard.

The pre-implementation reuse check was `5e0df4f8-93a3-403a-83b1-eab8e3a0df6c`, with planned decision `a90bdfb2-d27c-4a2d-9a8f-8ea04eba5a86`. It inspected local `src/sources.ts` and `src/core.ts`, plus `algoliasearch-helper@3.30.1` at fixed revision `3d258cf58b621da1347809e06282b83d4aab8ca2`. The local implementation was reused; the Algolia-specific dependency was rejected. Initial GitHub rate limits and local match limits were explicitly acknowledged before implementation. Applied and verified records are linked to that planned decision in `.reuse-assistant/`; verification commands/outcomes are host-reported.

## v0.2 local verification — 2026-10-27 (Asia/Shanghai)

The user reports v0.1 passed acceptance. This run extends the implementation to v0.2; it does not repeat or claim a new desktop hook activation. Environment: Windows PowerShell, Node v24.15.0, npm 11.12.1.

`npm run check` and `npm test` pass; the deterministic suite now has **40/40** passing tests. The added tests exercise the public `ReuseAssistant.check/inspect/decide` interface and a real MCP SDK client/server over stdio, with deterministic injected endpoint responses. They cover all new registries, ecosystem/explicit source selection, cache isolation, cross-platform identities, package aliases, fixed commits/version evidence, NuGet index/pages and regional redirects, source failures/deadlines, credential isolation, local language-independent UTF-8 search and additional root manifests. The existing Codex transport/BOM regression tests still pass. These tests do not execute upstream packages or call a model.

`node dist/test/live-smoke-v2.js` (also available through `npm run smoke:v2`) exited **0** on the latest run, 15:09:13–15:09:44 UTC. All six source queries returned candidates. The exact records and prior two unsuccessful runs are retained in [live-smoke-v2.json](live-smoke-v2.json).

| Source | Observed candidate/version | Evidence result |
|---|---|---|
| GitLab | `libeigen/eigen`, commit `1c67c09148a0eef07bf3278f351e75b92196c3af` | Complete bounded read: README, license file and CMake code range |
| crates.io | `serde_json@1.0.154` | Version metadata, README, license and Cargo.toml; repository/release code correspondence unverified |
| Maven Central | `com.google.code.gson:gson@2.14.0` | Fixed version POM; partial overall evidence because SCM/license/parent interpretation remains host work |
| NuGet | `Newtonsoft.Json@13.0.4` | Fixed version metadata selected from registration index; partial overall evidence because no supported repository association was supplied |
| RubyGems | `rake@13.4.2` | Version metadata, README and license; repository/release code correspondence unverified |
| Packagist | `monolog/monolog@3.12.1` | Version metadata and code at published `source.reference`, README, license and composer.json |

Earlier runs retained GitLab search/inspection timeouts, a NuGet redirect failure and catalog HTTP 404, Packagist metadata timeout, and GitHub evidence HTTP 403. NuGet reads now support bounded official regional redirects and registration-page metadata rather than depending on an available catalog endpoint. These observations are individual network samples, not a recall benchmark or reliability guarantee. `coverage: complete` still means the selected finite plan completed.

`git diff --check` and `npm pack --dry-run --json` pass. The dry run includes the new compiled modules, source files, changelog, source matrix and roadmap. No v0.2 remote CI matrix, npm publication, macOS run or new desktop MCP reload/activation is claimed. Running desktop MCP processes must reload the new build for the expanded schema.

Reuse workflow: original check `f0546310-a8c1-4062-9429-3cf4f6c730ee`; continuation check `6ce3f35d-52d0-486b-b07b-050fdce7dba3` after the user supplied a new turn binding. The continuation cites inspected local transport/registry evidence and links planned/applied/verified decisions. Incomplete local discovery and historical source outages are explicitly acknowledged in those records. No new upstream implementation was copied; existing attribution and the user's RSS example changes were preserved.

## Historical v0.1 baseline

The following record describes the earlier v0.1 run on 2026-10-27 (Asia/Shanghai), using Windows PowerShell, Node v24.15.0, npm 11.12.1 and Codex CLI 0.147.0. Counts and host status below are historical, not the current v0.2 test total.

## Deterministic product checks

`npm run check` passes. `npm test` currently passes 20/20 tests. The suite verifies:

- local inspection/adoption and planned/applied/verified transitions;
- rejection of invented candidates/evidence, stale dependency context, unacknowledged coverage gaps and missing validation claims;
- expected manifest changes during linked integration stages;
- fresh local search with labeled remote caching and constraint invalidation;
- preservation of two-character Chinese terms and routing exact scoped npm names;
- no minimum-star filter, package/repository identity separation and external shortlist visibility;
- source-specific query limits, explicit shortened coverage and returned results;
- GitHub commit evidence, line-range reads and Python distribution association;
- structured throttling, Retry-After date/seconds, bounded retries/deadlines, byte limits and selective authorization;
- project initialization/uninstall preserving unrelated entries, safe generated launchers for paths with shell metacharacters, UTF-8 input with or without a BOM, and confined storage;
- session/turn-specific patch guard behavior and explicit absence of shell guard coverage;
- a real MCP SDK client over stdio performing check → inspect → decision, including a failed invalid decision;
- lifecycle report completion and recovery of pre-index records.

These tests use deterministic injected registry responses where appropriate. The stdio test launches the real compiled server; it does not call a model.

## Public endpoint observations

`npm run smoke` queries GitHub/npm for the official MCP TypeScript implementation and verifies Python scheduling metadata through GitHub/PyPI. The machine-readable observation is [live-smoke.json](live-smoke.json), with exact timestamps, versions, source states and fixed evidence references.

The initial successful observation found `@modelcontextprotocol/server@2.4.0` and `APScheduler@3.11.3`; the SDK query plan took 1,871 ms and Python plan 800 ms on that run. Both candidate inspections completed. Those are individual observations, not latency guarantees or recall measurements. Registry version metadata is separated from repository HEAD when release correspondence is unverified.

An independent skill run exposed npm HTTP 400 on a long English query. A direct request identified the registry's 2–64 character text limit. A separate GitHub request confirmed its 256-character query limit. The adapters now shorten at word boundaries, expose the actual query and mark shortened coverage partial. Regression tests exercise the complete check interface rather than hiding the failure as zero results.

## Independent skill behavior

A separate agent received only the skill, CLI location, an isolated small package and a feature request: expose HTTP retry support through the package entry point, retry 429/5xx at most three times with 50/100 ms exponential waits, support injected waiting, and retain the existing export.

It discovered and inspected the existing `src/network/request.js` function. It reused that function/control flow, added the entry-point export, tightened attempt/status bounds, and added package-entry behavior tests. It did not add another retry implementation or an external dependency.

Actual check/evidence/decision references:

| Stage | ID |
|---|---|
| Check | `85442c5b-f4ea-4542-9d4f-314ca9fa1983` |
| Inspection | `5f98d8f7-13ca-4f0e-989e-c4d63c10908e` |
| Planned | `5968fb69-c899-4279-81bd-4dfad4e49483` |
| Applied | `59a11cda-9fc0-45a3-a0aa-795bc85d780a` |
| Verified | `2d1961a7-ea7f-48bc-9bfe-841d6c6ed195` |

Planned was recorded before edits. All stages acknowledged the original npm coverage gap. `npm test` in that isolated example passed 19/19 tests twice, including preservation of the existing export, identity of the re-exported function, request limits/statuses, awaited injected delay, and error propagation. Those 19 are separate example tests, not part of the product's 20-test total.

The run used explicit skill invocation and CLI fallback. It demonstrates one actual local-reuse workflow; it does not establish universal implicit skill selection, production task recall, or live Codex hook activation. A fixed post-verification report prompt was also found and corrected; historical records now render the latest stage and host-reported validation.

## Codex integration status

The product was also used on an actual maintenance change in this checkout: reuse its existing adapters/formatter/core to fix query limits and completion reporting. Check `38a69def-c6e3-46f9-9b10-ab67ddec8a13` recorded a plan before implementation, inspected the existing modules, then linked applied and verified decisions. Final verified decision: `1f4dd019-91e7-41e0-aa95-431d13ff72eb`. Validation included the 20-test suite, a live replay of the previously failing long query, and isolated package installation. The replay returned explicit partial coverage and results without the npm HTTP 400; the old historical verified workflow now renders its completed state.

Project-scoped configuration/skill/hooks were generated in the development checkout. The local CLI reports hooks enabled. Tests verify actual hook payload handling, generated launcher execution through PowerShell, and the real MCP transport.

A read-only Codex app-server `config/read` probe found the new project layer and its Reuse Assistant entry, but reported that layer disabled because the project is not trusted. No global trust settings or hook trust store were changed. Trusting/opening this project and accepting its hook definitions in the host remains necessary before claiming actual activation. `doctor` explicitly distinguishes configuration presence from runtime loading/trust.

Shell writes and existing interactive sessions are outside the declared patch guard. Client callback/trust/timeout behavior remains host-owned. See [official project configuration](https://learn.chatgpt.com/docs/config-file/config-advanced) and [hooks](https://learn.chatgpt.com/docs/hooks).

## Packaging and platform checks

The runtime dependency audit reported zero known vulnerabilities at the time checked (`npm audit --omit=dev`); that is a snapshot, not a source audit. Exact dependencies are locked.

Source and compiled CLI, skills, license/attribution and documentation are included in the package manifest. `prepack` builds the checkout before packaging. An actual tarball was installed into an isolated project with install scripts disabled: five runtime packages were installed, the packaged CLI generated the integration/skill, and an import of the packaged core successfully found the local manifest. The source archive was also extracted into a clean directory, installed and rebuilt; its 20/20 tests passed. Skill format validation passed using Python UTF-8 mode. The private package flag prevents accidental npm publication; GitHub is the initial distribution channel.

CI is configured for Node 22/24 on Ubuntu/Windows with pinned action commits. See the actual [GitHub Actions runs](https://github.com/tianxiashan294-design/reuse-assistant/actions) for remote results; local Node 24 success does not imply those remote matrix jobs passed.

The first remote run passed both Linux jobs but exposed a Windows PowerShell transport difference: native UTF-8 pipelines can prepend BOM markers, causing hook JSON parsing to return the generic supported denial. A local three-mode probe reproduced the difference using the same generated command (default encoding passed, UTF-8 with BOM failed, UTF-8 without BOM passed). Removing one marker fixed default remote input but not forced UTF-8 input: a fixture-only remote byte probe captured two consecutive `efbbbf` markers before the JSON. The existing bounded stdin reader now removes leading BOM markers before JSON parsing. The real-shell regression exercises default, single-marker and repeated-marker input on each platform, and failed locally before the corresponding fix. Malformed JSON still follows the existing denial path. Temporary byte diagnostics were removed.

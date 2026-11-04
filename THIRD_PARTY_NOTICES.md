# Upstream attribution

This project combines selected existing designs and adapted code. It does not run the three upstream servers as subprocess dependencies.

| Upstream | Fixed revision | Used here | Changes |
|---|---|---|---|
| [wheel-hub](https://github.com/skyzhao1223/wheel-hub) | `fe1acd6abf8a4fe3e997431f98f38861bf442148` | `src/sources.ts`: GitHub field normalization and logarithmic popularity signal derived from `packages/core/src/github.ts` and `score.ts` | Removed star threshold and automatic adopt verdicts; added request deadlines, exact error states, per-package identity and query relevance ordering |
| [reuse-before-generate](https://github.com/aradar46/reuse-before-generate) | `f9141bfef5b4a11c1fbfa12bd810af8b7ce1a7c5` | `src/sources.ts`: npm endpoint/mapping adapted from `index.js`; multi-query discovery workflow | Modular adapters; Unicode preserved; explicit failures; no guess-name PyPI search or import-time CLI side effects |
| [scout-mcp](https://github.com/bartonguestier1725-collab/scout-mcp) | `f8a6ea8385bc23e008dcd92db819e10a67422d23` | `src/types.ts`, `src/http.ts`, `src/core.ts`: result/error and parallel aggregation design adapted from `types.ts`, `fetch-utils.ts`, `tools/scout-report.ts` | Bounded workers, global cancellation, structured failure propagation, byte limits, date Retry-After, evidence and decisions |

The official MCP SDK and smol-toml are normal dependencies, not copied source. Their own licenses ship with their packages. See `package-lock.json` for exact resolved dependencies.

The v0.2 GitLab/crates.io/Maven/NuGet/RubyGems/Packagist adapters are new integration code built on this project's existing core and official public API documentation (references in `docs/SOURCES.md`). No additional upstream implementation was copied or added as a dependency. `query-registry@4.4.0` at `611281557e18d69135ce51acd71f74299fb6a26c` was inspected and rejected because its npm-only scope does not meet the multi-ecosystem requirement; none of its code is incorporated.

The v0.3 pagination scheduler and adapter changes reuse this project's existing core/transport and official API protocols (see `docs/SOURCES.md`); no additional upstream code was copied and no dependency was added. `algoliasearch-helper@3.30.1` / `algolia/instantsearch` at `3d258cf58b621da1347809e06282b83d4aab8ca2` was inspected and rejected because its Algolia-specific search model does not fit these independent public registries; none of its code is incorporated. Existing upstream notices and modifications above remain applicable.

## v0.4 structural parser dependency

The code-segment analyzer adopts unmodified **@babel/parser 7.28.5** (MIT) from the fixed published artifact `https://registry.npmjs.org/@babel/parser/-/parser-7.28.5.tgz`, integrity `sha512-KKBU1VGYR7ORr3At5HAtUQ+TV3SzRCXmA/8OdDZiLDBIZxVyzXuztPjfLd3BV1PRAQGCMWWSHYhL0F8d5uHBDQ==`. No upstream implementation is copied or modified. The original parser notice is **Copyright (C) 2012-2014 by various contributors (see AUTHORS)**, followed by the MIT permission/warranty terms preserved below and shipped in the installed package's LICENSE.

The lockfile also fixes its unmodified MIT dependencies: **@babel/types 7.29.11**, **@babel/helper-string-parser 7.29.11**, and **@babel/helper-validator-identifier 7.29.7**, each with its npm artifact integrity. Their original notice is **Copyright (c) 2014-present Sebastian McKenzie and other contributors**, with the same MIT terms preserved below; each package ships its LICENSE. The segmentation, evidence linkage, architecture checks and prompt integration are original project code.

Discovery inspected `@babel/parser@8.1.0` metadata but rejected that version's narrower Node minor requirements; exact 7.28.5 registry metadata and its installed license were checked separately. `ast-types@0.16.3` was inspected and rejected as an AST abstraction rather than the required parser. GitHub source reads returned HTTP 403; no commit/source-code inspection is claimed for either candidate. Existing TypeScript 7.0.2 exposes unstable native interfaces unsuitable for this bounded in-process parser use.

## v0.6 structural parser and grammar assets

The shared analyzer adopts unmodified **web-tree-sitter 0.27.1** (MIT), npm artifact `https://registry.npmjs.org/web-tree-sitter/-/web-tree-sitter-0.27.1.tgz`, integrity `sha512-qtx0VyUyNRHtL3ze7+v0hCKB/sLcAmY7ZAVp/ZK/bCj0yED8ptvNrr7Vd7DwDyKDWN9baqcUx4uaD2r2ql+6IA==`, fixed revision `10eb5ac119eec9cb4267a8e035066473983f5f3a`. Original notice: **Copyright (c) 2018 Max Brunsfeld**. Its MIT terms are preserved below and in the installed package's LICENSE. No runtime source is copied or modified.

Three unmodified WASM grammar files are redistributed in `assets/grammars`. Their original complete MIT licenses are adjacent to the assets, and `manifest.json` records exact release URLs, revisions, ABI and SHA-256. The official release tags were resolved through GitHub to the following commits (also matching published npm gitHead metadata). This establishes the published release/tag identities, not an independent reproducible-build proof of the binaries.

| Grammar | Fixed version / revision | Original notice | Modifications |
|---|---|---|---|
| [tree-sitter-python](https://github.com/tree-sitter/tree-sitter-python) | `0.25.0` / `293fdc02038ee2bf0e2e206711b69c90ac0d413f` | Copyright (c) 2016 Max Brunsfeld | None; official release WASM only |
| [tree-sitter-go](https://github.com/tree-sitter/tree-sitter-go) | `0.25.0` / `1547678a9da59885853f5f5cc8a99cc203fa2e2c` | Copyright (c) 2014 Max Brunsfeld | None; official release WASM only |
| [tree-sitter-rust](https://github.com/tree-sitter/tree-sitter-rust) | `0.24.0` / `18b0515fca567f5a10aee9978c6d2640e878671a` | Copyright (c) 2017 Maxim Sokolov | None; official release WASM only |

Python and Go asset hashes also match the official GitHub release asset digests. Rust's release did not publish a digest; the manifest preserves the locally computed hash of that downloaded official artifact. No native bindings, upstream grammar build scripts or installation scripts are included. The language adaptation, budget integration and evidence mapping are original project code. Grammars are read as syntax data; inspected candidate programs are never executed.

`tree-sitter-wasms@0.1.13` at `3e88dc9e36b4e8bf752ce53bea61e4b67282a2bb` was inspected and rejected after its old dylink format failed to load with the selected runtime. None of its files or dependencies are shipped.

## v0.7 additional grammar assets and registry integrations

The existing unmodified `web-tree-sitter@0.27.1` runtime is reused without new runtime dependencies. Four additional **unmodified official release WASM files** are redistributed in `assets/grammars`, each with its complete original MIT license and a manifest entry containing fixed release URL, revision, ABI and SHA-256:

| Grammar | Fixed version / revision | Original notice | Modifications |
|---|---|---|---|
| [tree-sitter-java](https://github.com/tree-sitter/tree-sitter-java) | `0.23.5` / `94703d5a6bed02b98e438d7cad1136c01a60ba2c` | Copyright (c) 2017 Ayman Nadeem | None; official release WASM |
| [tree-sitter-c-sharp](https://github.com/tree-sitter/tree-sitter-c-sharp) | `0.23.5` / `cac6d5fb595f5811a076336682d5d595ac1c9e85` | Copyright (c) 2014-2023 Max Brunsfeld, Damien Guard, Amaan Qureshi, and contributors. | None; official release WASM |
| [tree-sitter-c](https://github.com/tree-sitter/tree-sitter-c) | `0.24.1` / `7fa1be1b694b6e763686793d97da01f36a0e5c12` | Copyright (c) 2014 Max Brunsfeld | None; official release WASM |
| [tree-sitter-cpp](https://github.com/tree-sitter/tree-sitter-cpp) | `0.23.4` / `f41e1a044c8a84ea9fa8577fdd2eab92ec96de02` | Copyright (c) 2014 Max Brunsfeld | None; official release WASM |

Official release tag commits match the recorded npm `gitHead` revisions. The C# SHA-256 matches GitHub's published asset digest; the other three releases supply no digest, so the manifest retains the locally computed hash of the downloaded official artifact. No independent reproducible build is claimed. Grammar/node-type descriptions and parent/dependency context were read as data; native installation/build scripts and candidate programs are not executed or shipped. Declaration mappings and all integration code are original project code.

The pub.dev and Hex adapters reuse this project's shared core/transport/pagination and official protocols linked in `docs/SOURCES.md`. No registry client implementation was copied or added as a dependency. pub.dev's undocumented search endpoint is not used; the official limited name corpus and Hosted Pub V2 metadata supply its supported evidence. All prior notices and modifications above remain applicable.

## v0.8 common-language grammar assets

The existing unmodified `web-tree-sitter@0.27.1` runtime is reused. Six additional **unmodified upstream release WASM files** ship in `assets/grammars`, each with its complete original MIT license. `manifest.json` fixes the release URL, tag commit, ABI and SHA-256. Revisions were resolved using Git at the release tag, not inferred from a different npm package version:

| Grammar | Fixed version / revision | Original notice | Modifications |
|---|---|---|---|
| [tree-sitter-php](https://github.com/tree-sitter/tree-sitter-php) | `0.25.1` / `58d5643086ae60e93a3746cca648363ee97c8761` | Copyright (c) 2017 Josh Vera, GitHub; Copyright (c) 2019 Max Brunsfeld, Amaan Qureshi, Christian Frøystad, Caleb White | None; upstream release WASM |
| [tree-sitter-ruby](https://github.com/tree-sitter/tree-sitter-ruby) | `0.23.1` / `71bd32fb7607035768799732addba884a37a6210` | Copyright (c) 2016 Rob Rix | None; upstream release WASM |
| [tree-sitter-kotlin](https://github.com/tree-sitter-grammars/tree-sitter-kotlin) | `1.1.0` / `77dd60ea0a9003ce062c9728a513ffe1aaff8c82` | Copyright (c) 2024 Amaan Qureshi <amaanq12@gmail.com> | None; upstream release WASM |
| [tree-sitter-swift](https://github.com/alex-pinkus/tree-sitter-swift) | `0.7.3` / `b8b22bffbb3441780e6471665bacfb263741c86a` | Copyright (c) 2021 alex-pinkus | None; upstream release WASM |
| [tree-sitter-bash](https://github.com/tree-sitter/tree-sitter-bash) | `0.25.1` / `a06c2e4415e9bc0346c6b86d401879ffb44058f7` | Copyright (c) 2017 Max Brunsfeld | None; upstream release WASM |
| [tree-sitter-lua](https://github.com/tree-sitter-grammars/tree-sitter-lua) | `0.5.0` / `10fe0054734eec83049514ea2e718b2a56acd0c9` | Copyright (c) 2021 Munif Tanjim | None; upstream release WASM |

PHP, Swift, Bash and Lua downloaded asset hashes match GitHub's published release digests. Ruby and Kotlin releases provide no digest, so their locally computed hashes are retained. These are pinned published artifacts, not independently reproduced builds. Full original licenses were read at the pinned Git revisions; grammar node types and inspected build/package context are data, never agent instructions. No upstream program, grammar generator, native binding or build script is executed or shipped. Mapping and integration code are original extensions of this project's shared analyzer; no runtime dependency is added.

`@repomix/tree-sitter-wasms@0.1.17` at `1876d74fb86d4e45efade2176b71d776f430e7e6` (Unlicense) was inspected, including `build.ts` and package/dependency context, then rejected in favor of individual upstream release assets with narrower provenance. None of its code or binaries is incorporated. Dart's inspected upstream has no release asset and remains text evidence in this update.

## Upstream MIT notices

wheel-hub: Copyright (c) 2026 wheelhub contributors

reuse-before-generate: Copyright (c) 2026 Aradar46

scout-mcp: Copyright (c) 2026 bartonguestier1725-collab

The following permission and disclaimer are preserved for the MIT-licensed upstream portions and Babel dependency notices described above:

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

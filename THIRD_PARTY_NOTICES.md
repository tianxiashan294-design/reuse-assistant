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

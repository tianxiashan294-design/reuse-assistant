# Upstream attribution

This project combines selected existing designs and adapted code. It does not run the three upstream servers as subprocess dependencies.

| Upstream | Fixed revision | Used here | Changes |
|---|---|---|---|
| [wheel-hub](https://github.com/skyzhao1223/wheel-hub) | `fe1acd6abf8a4fe3e997431f98f38861bf442148` | `src/sources.ts`: GitHub field normalization and logarithmic popularity signal derived from `packages/core/src/github.ts` and `score.ts` | Removed star threshold and automatic adopt verdicts; added request deadlines, exact error states, per-package identity and query relevance ordering |
| [reuse-before-generate](https://github.com/aradar46/reuse-before-generate) | `f9141bfef5b4a11c1fbfa12bd810af8b7ce1a7c5` | `src/sources.ts`: npm endpoint/mapping adapted from `index.js`; multi-query discovery workflow | Modular adapters; Unicode preserved; explicit failures; no guess-name PyPI search or import-time CLI side effects |
| [scout-mcp](https://github.com/bartonguestier1725-collab/scout-mcp) | `f8a6ea8385bc23e008dcd92db819e10a67422d23` | `src/types.ts`, `src/http.ts`, `src/core.ts`: result/error and parallel aggregation design adapted from `types.ts`, `fetch-utils.ts`, `tools/scout-report.ts` | Bounded workers, global cancellation, structured failure propagation, byte limits, date Retry-After, evidence and decisions |

The official MCP SDK and smol-toml are normal dependencies, not copied source. Their own licenses ship with their packages. See `package-lock.json` for exact resolved dependencies.

## Upstream MIT notices

wheel-hub: Copyright (c) 2026 wheelhub contributors

reuse-before-generate: Copyright (c) 2026 Aradar46

scout-mcp: Copyright (c) 2026 bartonguestier1725-collab

The following permission and disclaimer are preserved for portions derived from each of these three MIT-licensed projects:

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

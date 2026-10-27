# Validation record

Local v0.1 verification, 2026-10-27 (Asia/Shanghai). Environment: Windows PowerShell, Node v24.15.0, npm 11.12.1, Codex CLI 0.147.0. This document separates deterministic tests, public endpoint observations, independent skill use and actual client activation.

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

# Reuse Assistant

[中文说明](README.zh-CN.md)

Check what already exists before a coding agent implements a feature. Reuse Assistant finds local implementations and public alternatives, retrieves pinned evidence, and records why the agent chose to reuse, adapt, learn from a design, or build a small implementation itself.

**v0.1.0 preview.** The official source repository is [tianxiashan294-design/reuse-assistant](https://github.com/tianxiashan294-design/reuse-assistant). This project is not published on npm; use this source checkout rather than a similarly named `npx` package.

## Quick start

Node.js 22+ is required. Development has been verified with Node 24 on Windows. The Node 22/24 Windows/Linux matrix runs in [GitHub Actions](https://github.com/tianxiashan294-design/reuse-assistant/actions).

```sh
git clone https://github.com/tianxiashan294-design/reuse-assistant.git
cd reuse-assistant
npm ci --ignore-scripts
npm run build
node dist/src/cli.js --help
```

Check a project:

```sh
node dist/src/cli.js check --project /absolute/project --task "Add background scheduling" --query "in-process task scheduler" --ecosystem python --json
```

For structured constraints, client bindings, or decisions, put arguments in a JSON file and use `--input request.json`. This also avoids shell quoting problems on Windows. `--input -` reads JSON from stdin.

## Workflow

1. **Check** existing project code and relevant public sources. Small fixes can use `--scope local`.
2. **Inspect** up to three promising candidates. Read actual documentation, licensing evidence and relevant code, not only popularity metadata.
3. **Decide** with evidence and a short requirement/cost rationale. Record `planned` before implementation.
4. **Integrate and validate** in the host agent. Record `applied`, then `verified`, linking each preceding decision and supplying the actual validation command/outcome.

The host performs semantic judgment and project edits. These tools store evidence and decisions; they do not execute candidate code, install dependencies, or independently run the validation command reported by the host.

## MCP and Codex

Run the standard stdio MCP server in any compatible host:

```sh
node dist/src/cli.js mcp --project /absolute/project
```

It exposes three tools:

| Tool | Responsibility |
|---|---|
| `check_reuse` | Local matches, registry/repository candidates, source status and coverage |
| `inspect_candidate` | Fixed commit/version metadata, official README/license, selected code or directories |
| `record_decision` | Evidence-backed choice and planned/applied/verified lifecycle |

For Codex project setup:

```sh
node dist/src/cli.js init --project /absolute/project --hooks
node dist/src/cli.js doctor --project /absolute/project
```

Initialization writes a project-scoped `.codex/config.toml`, a discoverable `.agents/skills/reuse-first` skill, optional `.codex/hooks.json`, and a state-directory ignore rule. It preserves unrelated MCP/config/hook entries and refuses an unmanaged same-name skill/server. Generated files contain checkout-specific paths; rerun initialization after moving the checkout. The hook launcher also needs Node on the host's PATH.

Open/trust that project in Codex, start a new session, and review/trust the hook definitions in the host. Codex skips project-local config and hooks for untrusted projects; generated files alone do not activate the integration. A `UserPromptSubmit` hook supplies the session/turn binding; include it in `check_reuse`. The patch guard permits declared `apply_patch`/`Edit`/`Write` paths after a current-turn planned decision. Missing records cause a supported denial with instructions for completing the check.

**Coverage is explicit:** shell writes, existing interactive sessions, unsupported tool paths and hosts without an adapter are outside this patch guard. Host callback timeouts and trust policies remain host behavior. `doctor` reports configuration presence, not proof that hooks are trusted or active. See [Codex hooks](https://learn.chatgpt.com/docs/hooks).

Remove generated integration while retaining records:

```sh
node dist/src/cli.js uninstall --project /absolute/project
```

Other agents can use the standard MCP tools and workflow skill now; client-specific automatic triggers/guards are currently implemented for Codex only.

## Discovery and evidence

- **Local:** bounded lexical search, manifests and relevant code. It is not a semantic code index. Up to 1,200 text files, 180 KB per file and 30 raw matches; the merged shortlist includes at most eight local matches so external options stay visible. Symlinks and generated/dependency/state directories are skipped.
- **GitHub:** repository/README discovery, including small projects; no minimum-star filter or automatic adopt threshold. Exact scoped npm queries are routed to npm.
- **npm:** registry search plus exact published-version metadata. Multiple packages in one repository keep distinct names and versions.
- **Python:** GitHub discovery, then installation/`pyproject.toml` evidence to identify a real distribution and PyPI JSON verification. Known names may be supplied with `packageNames`. This is **not PyPI full-text search**. Repository, import and distribution names are not assumed equal.

`inspect_candidate` accepts repository-relative paths, including `src/file.ts#L100-L180`. Inspect a package alias such as `npm:@scope/name` when a merged repository publishes several packages. Code is pinned to a commit. An npm `gitHead`, when supplied and associated with the repository, can link that commit to the published package; otherwise the report explicitly marks that association unverified. Registry metadata and repository HEAD are distinct evidence.

Source outcomes distinguish success, zero results, partial coverage, throttling, timeout, unavailability and intentionally skipped operations. A completed bounded query plan is not an exhaustive ecosystem search. Incomplete searches/evidence require acknowledgment before the corresponding decision. Unknown licenses and requirement fit remain review work for the host.

Queries are adapted to registry limits (npm 64 characters; GitHub 256 including qualifiers). Shortened queries expose the actual request and mark coverage partial instead of silently dropping terms or returning an avoidable HTTP error.

Ordinary discovery defaults to a 60-second budget with up to four workers, bounded retry/response sizes and cancellation. Deep inspection has a separate per-call budget and a three-distinct-candidate limit. Remote results may be cached for six hours and are labeled; local code is searched freshly. Changed tasks, constraints or dependency manifests invalidate the relevant context. Expected manifest changes during integration are tracked through linked decision stages.

## Configuration and local records

No additional model API key is required. `GITHUB_TOKEN` is optional; the generated Codex config forwards its environment variable name, never a literal token. Only GitHub receives that authorization header. Network reads use the GitHub API, npm registry and PyPI; redirects and unsupported URL hosts are rejected.

Project records live in `.reuse-assistant/`:

```text
checks/       candidates, coverage, inspections
decisions/    choices and host-reported validation
decision-index/ latest lifecycle stage per check
cache/        labeled remote results
sessions/     current client turn state
```

Use public functional terms for external queries. Local source files are inspected locally; credentials are not stored by the tool. Records may contain project/task information and should remain outside version control. Uninstall retains these records and their ignore rule.

## Verification and contribution

```sh
npm run check
npm test
npm run smoke
```

`npm test` is deterministic and includes a real stdio SDK-client workflow. `npm run smoke` contacts public endpoints and writes `docs/live-smoke.json`; it is an observation, not a recall benchmark. See [validation notes](docs/VALIDATION.md), [contribution guide](CONTRIBUTING.md), and [architecture](docs/ARCHITECTURE.md).

The core is shared by CLI and MCP. Source adapters and future client adapters extend separate seams; candidate/evidence/decision semantics stay common. npm distribution and additional client adapters are future work.

## License and upstream work

MIT. Selected code/designs from wheel-hub, reuse-before-generate and scout-mcp are adapted with attribution. See [third-party notices](THIRD_PARTY_NOTICES.md) for fixed revisions, modifications and retained MIT notices. Official MCP SDK and TOML parsing are dependencies, not reimplemented protocols/parsers.

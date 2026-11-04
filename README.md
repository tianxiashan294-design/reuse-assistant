# Reuse Assistant

[简体中文](README.zh-CN.md)

Help coding agents check what already exists before writing new code.

Reuse Assistant searches the current project and public repositories or package registries, reads evidence from fixed revisions, and records why an agent chose to reuse a dependency, adapt code, follow a design, or build an implementation. It works with **Codex, Claude Code, OpenCode and DeepSeek Harness**, through a shared MCP server and CLI.

## What it does

- Finds relevant local code and public alternatives, including GitHub, GitLab and package registries.
- Retrieves documentation, license information and selected source files, with structural context for supported languages.
- Helps compare candidates against the whole task, integration cost and existing architecture.
- Records the decision, implementation and validation result. Source failures and coverage limits remain visible.

Your coding agent makes the judgment, edits your project and runs its tests. Reuse Assistant supplies evidence and keeps the decision trail. See [source coverage](docs/SOURCES.md) and [evidence and alignment](docs/ALIGNMENT.md) for details.

## Requirements and setup

| Requirement | Purpose |
|---|---|
| Git | Clone the source repository |
| Node.js 22 or later, with npm | Install dependencies, build and run the server |
| A supported coding agent | Use the MCP tools and `reuse-first` skill; the CLI also works on its own |
| Internet access | Install dependencies and search public sources; use `--scope local` for offline project checks after setup |

Reuse Assistant needs no additional model API key. Configure your coding agent's own account or model provider as usual.

### Install from source

```sh
git clone https://github.com/tianxiashan294-design/reuse-assistant.git
cd reuse-assistant
npm ci --ignore-scripts
npm run build
node dist/src/cli.js --help
```

Run the commands below from this checkout. Replace `/absolute/project` with the absolute path to the project you want the agent to work on. On Windows, a quoted path such as `"C:\projects\my-app"` works too.

### Optional credentials

Public searches work without tokens, subject to each service's access and rate limits. To use a GitHub or GitLab token, set `GITHUB_TOKEN` or `GITLAB_TOKEN` in the environment that launches your agent or the CLI.

For example, in PowerShell:

```powershell
$env:GITHUB_TOKEN = "your-token"
```

Or in a POSIX shell:

```sh
export GITHUB_TOKEN="your-token"
```

Set `GITLAB_TOKEN` the same way if needed. Generated configuration references the environment variables; it does not save token values.

## Connect your coding agent

Choose your client, then run `init`. For example, for Claude Code:

```sh
node dist/src/cli.js init --project "/absolute/project" --client claude-code
```

| Client | `--client` value | After initialization |
|---|---|---|
| Codex | `codex` | Open and trust the target project, then start a new session |
| Claude Code | `claude-code` | Restart in the target project, approve the MCP server as needed, and check `/mcp` |
| OpenCode | `opencode` | Restart in the target project and check MCP status and the skill catalog |
| DeepSeek Harness | `deepseek-harness` | Launch with the generated Cordis overlay, as shown below |

Initialization writes project-level MCP configuration and a `reuse-first` skill. Claude Code, OpenCode and DeepSeek also receive a project instruction pointer. Unrelated configuration is preserved, and same-name unmanaged entries are reported for review. Multiple clients can share one project's records.

For **DeepSeek Harness**, launch from the target project using the overlay returned by `init`:

```sh
dsh --profile web --patch "/absolute/project/.dsh/reuse-assistant.cordis.patch.yml"
```

Select that project as the session workspace. This server stays bound to the same project throughout the process; use a separate process and overlay for another project.

For **OpenCode JSONC** configurations, follow the [manual setup instructions](docs/CLIENTS.md#manual-opencode-jsonc). Automatic setup merges strict `opencode.json` only.

For **Codex**, optional hooks can supply a current-turn binding and guard supported patch tools:

```sh
node dist/src/cli.js init --project "/absolute/project" --client codex --hooks
```

Review and trust the generated hooks in Codex. This guard covers declared patch tools, while shell writes remain outside its coverage. The other clients use MCP, skills and project instructions without an automatic patch guard.

### Check or remove the integration

Use your chosen client's value in both commands:

```sh
node dist/src/cli.js doctor --project "/absolute/project" --client claude-code
node dist/src/cli.js uninstall --project "/absolute/project" --client claude-code
```

`doctor` checks files and expected configuration. Confirm server loading in the actual agent by finding the four tools below and the `reuse-first` skill. Uninstall removes generated integration while retaining project records; handling of edited files depends on the client and is described in the [client guide](docs/CLIENTS.md). Restart the agent after configuration changes; after DeepSeek uninstall, omit its `--patch` argument. Rerun `init` if you move the Reuse Assistant checkout.

For other MCP hosts, configure a stdio server with your Node executable and the arguments `/absolute/reuse-assistant/dist/src/cli.js mcp --project /absolute/project`. Use separate argument-array entries for each argument. See the [client guide](docs/CLIENTS.md) for configuration paths and details.

## Use it

After connecting, ask your agent to follow the reuse workflow. For example:

> Add background scheduling. First check this project and existing libraries, read the promising candidates, and record the choice before implementing it.

The `reuse-first` skill guides the agent through checking, inspection, whole-task alignment and a planned decision. The agent then implements and tests the change, recording `applied` and `verified` results. Small fixes can start with a local check.

| MCP tool | Purpose |
|---|---|
| `check_reuse` | Search local code and selected public sources |
| `inspect_candidate` | Read pinned documentation, license and code evidence |
| `assess_alignment` | Check evidence references, task requirements and the integration plan |
| `record_decision` | Record the choice and its planned, applied or verified stage |

You can also use the CLI directly:

```sh
node dist/src/cli.js check --project "/absolute/project" --task "Add background scheduling" --query "in-process task scheduler" --ecosystem javascript --json
```

Add `--scope local` to search only the project. Use `--input request.json` for structured constraints, alignment contracts and decisions; `--input -` reads JSON from stdin. Run `--help` for the command list.

Records live in the target project's `.reuse-assistant/` directory, which initialization adds to `.gitignore`. Keep these task records local and use public technical terms in external queries. Reports distinguish failed searches, empty results and incomplete coverage; they do not promise exhaustive discovery.

## Open source and contribution

Reuse Assistant is released under the [MIT License](LICENSE). You may use, modify, redistribute and commercially use it under those terms. When distributing copies or substantial portions, retain the copyright and license notices, along with applicable [third-party notices](THIRD_PARTY_NOTICES.md).

To contribute, fork the repository, create a branch, make your changes and open a pull request. Before submitting, run:

```sh
npm run check
npm test
```

Describe the problem, the change and how you validated it. When incorporating upstream code, record its fixed revision, original notice and modifications. See [CONTRIBUTING.md](CONTRIBUTING.md) and the [architecture guide](docs/ARCHITECTURE.md) for project conventions. Report problems or suggest improvements through [GitHub Issues](https://github.com/tianxiashan294-design/reuse-assistant/issues).

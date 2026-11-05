# Agent clients

All clients run the same stdio MCP server and share project discovery, evidence, alignment and decision records. Node.js 22+ and a built source checkout are required; no additional model API is required. This project is not published on npm.

## Setup and capabilities

Run from this checkout, choosing the client you use:

```sh
node dist/src/cli.js init --project /absolute/project --client claude-code
node dist/src/cli.js init --project /absolute/project --client opencode
node dist/src/cli.js init --project /absolute/project --client deepseek-harness
```

Multiple clients may coexist. Omitting `--client` retains Codex behavior. Only Codex accepts `--hooks`.

| Client | Native MCP configuration | Skill directory | Project instructions | Patch guard |
|---|---|---|---|---|
| Codex | `.codex/config.toml` | `.agents/skills/reuse-first/` | Discoverable skill | Optional existing hooks |
| Claude Code | `.mcp.json`, `mcpServers.reuse_assistant` | `.claude/skills/reuse-first/` | Managed `CLAUDE.md` block | Not implemented |
| OpenCode | `opencode.json` or `opencode.jsonc`, `mcp.reuse_assistant` | `.opencode/skills/reuse-first/` | Managed `AGENTS.md` block | Not implemented |
| DeepSeek Harness | `.dsh/reuse-assistant.cordis.patch.yml` | `.dsh/skills/reuse-first/` | Managed `AGENTS.md` block | Not implemented |

The new adapters provide MCP, skills and project instructions; the agent follows the workflow voluntarily. They create no session/turn binding. Omit `binding` unless a compatible hook actually supplies it. Native Claude hooks, OpenCode plugins and DeepSeek experimental hook bridges require separate adapters before equivalent enforcement can be claimed. Shell writes remain outside the Codex guard too.

Claude Code JSON setup preserves unrelated values and normalizes whitespace. It refuses invalid JSON, non-object sections and unmanaged same-name entries before content writes.

OpenCode setup uses the sole existing root `opencode.json` or `opencode.jsonc`; both filenames accept comments and trailing commas. With neither present it creates `opencode.json`. The installer changes the managed MCP entry while retaining unrelated values and comments. Whitespace at an edited boundary can change, and comments inside a replaced managed server value can be removed. Repeating `init` with an equal server value leaves the configuration text unchanged.

If both files exist, automatic setup and removal refuse changes, and `doctor` reports the ambiguity. This is the installer's conflict policy; OpenCode can merge configuration from multiple locations. Reconcile the files first. A receipt records the selected filename; moving a managed entry to the other filename requires manual reconciliation before setup or removal. Malformed JSONC, duplicate decoded property names anywhere in the document, non-object `mcp` sections and unmanaged or modified same-name server entries also block automatic setup before content writes. A different JSON key spelling that decodes to the same name is still a duplicate.

## Activate in the host

Claude Code: restart `claude` in the project, review host trust/MCP approval, and check `/mcp`. OpenCode: restart `opencode` in the project and inspect MCP status and the skill catalog. Installer results provide executable, argument arrays and working directory, supporting spaces and Windows paths.

DeepSeek uses an explicit **Cordis overlay**, rather than automatically loading a project MCP JSON file:

```sh
dsh --profile web --patch /absolute/project/.dsh/reuse-assistant.cordis.patch.yml
```

Use the launch arguments returned by `init`. Launch from the target project and select it as the session workspace. Prefer the Git worktree root: the default filesystem skill provider discovers project roots using the nearest `.git` ancestor. The overlay inserts `@deepseek-ai/dsh-mcp-client` into a shipped profile. Its server working directory and `--project` argument are fixed: every session in that process that sees this server uses **that project's records**. Start a separate process/overlay for a different project. Custom profiles must supply the MCP/tool and filesystem-skill services. Avoid another `reuse_assistant` server in the same scope.

Setup does not modify `DSH_HOME`, home patches or profile bundles. Without `--patch`, the server is unloaded. DeepSeek Harness remains a developer preview with possible compatibility-breaking changes.

Each host should expose `check_reuse`, `inspect_candidate`, `assess_alignment`, `record_decision`, and the `reuse-first` skill. Complete a check/inspection/alignment/decision workflow in the actual host to verify activation. Files and SDK tests alone do not establish this result. Higher-priority/global configuration and same-name skills can alter effective host behavior.

## Diagnose, update and uninstall

```sh
node dist/src/cli.js doctor --project /absolute/project --client claude-code
node dist/src/cli.js uninstall --project /absolute/project --client claude-code
```

Substitute `opencode` or `deepseek-harness` as needed. `doctor` inspects files and expected commands, reports missing/modified content, and explicitly leaves runtime loading unverified. It cannot establish host trust, effective overrides or model compliance.

Repeated `init` updates unchanged managed content and refreshes paths after moving/rebuilding the checkout. Version 1 receipts in `.reuse-assistant/integrations/<client>.json` record the selected configuration path, owned server values, file hashes and instruction blocks; existing receipts remain supported. Retain these with local records. Existing same-name files without a receipt are user-owned, even if they contain a managed marker. Modified content blocks replacement; uninstall retains it, reports its path, and retains the receipt for review. Reconcile modifications manually before retrying. Separate native skill directories allow each client to be uninstalled independently.

Uninstall preserves unrelated config/instructions, evidence/decision records and the ignore rule. OpenCode removal edits only the unchanged managed entry and required separators, retaining surrounding comments and unrelated values; whitespace at that boundary can change. Claude Code JSON formatting can be normalized. After DeepSeek uninstall, stop the old process and omit `--patch` on future launches. Restart all clients' existing MCP processes after rebuilding. Known conflicts are preflighted before content writes; filesystem failure or concurrent external edits can still interrupt a multi-file update. Avoid concurrent setup/edit operations on the same config.

Optional `GITHUB_TOKEN`/`GITLAB_TOKEN` use native runtime environment references: Claude `${VAR:-}` (empty fallback), OpenCode `{env:VAR}`, and DeepSeek `!!js process.env.VAR ?? ''`. DeepSeek's subprocess environment is scrubbed, so explicit forwarding matters. Token values are never captured in generated files. Run each host with the environment intended for the server.

## Manual OpenCode JSONC

Automatic setup supports JSONC as described above. For a user-owned manual setup instead, merge this entry into your existing `mcp` object, retaining other values and comments. Replace executable, script and project paths with absolute paths; escape JSON backslashes on Windows.

```jsonc
{
  "mcp": {
    "reuse_assistant": {
      "type": "local",
      "command": ["/absolute/node", "/absolute/reuse-assistant/dist/src/cli.js", "mcp", "--project", "/absolute/project"],
      "enabled": true,
      "timeout": 120000
    }
  }
}
```

Copy this checkout's `skills/reuse-first/` into the project's `.opencode/skills/reuse-first/`, including both references. Edit `references/local-cli.md` to name the built CLI and target project. Add a pointer in `AGENTS.md` to read this skill before feature work and small fixes. Manual setup is user-owned: automatic install/uninstall does not claim ownership of it. `doctor` can inspect the configuration but reports a missing receipt and leaves actual host loading unverified.

## Compatibility evidence and validation limits

Official client contracts checked on 2026-11-04; OpenCode JSONC format and location documentation rechecked on 2026-11-05:

- Claude Code [project MCP configuration](https://code.claude.com/docs/en/mcp) and [skills](https://code.claude.com/docs/en/skills).
- OpenCode [configuration formats and locations](https://opencode.ai/docs/config/), [local MCP configuration](https://opencode.ai/docs/mcp-servers/), [environment interpolation](https://opencode.ai/docs/config/#env-vars), [skills](https://opencode.ai/docs/skills/) and [rules](https://opencode.ai/docs/rules/).
- DeepSeek Harness revision `8bd073392eef6f54e921a093b95076248eb08cbb`: [CLI overlays](https://github.com/deepseek-ai/deepseek-harness/blob/8bd073392eef6f54e921a093b95076248eb08cbb/apps/cli/reference/README.md), [MCP client](https://github.com/deepseek-ai/deepseek-harness/blob/8bd073392eef6f54e921a093b95076248eb08cbb/packages/mcp/mcp-client/README.md), [filesystem skills](https://github.com/deepseek-ai/deepseek-harness/blob/8bd073392eef6f54e921a093b95076248eb08cbb/packages/skill/skill-filesystem/README.md).

These client contracts are configuration references, not copied upstream implementations. The JSONC adapter uses the fixed `jsonc-parser` dependency; its original notice and revision are recorded in [third-party notices](../THIRD_PARTY_NOTICES.md). Offline tests execute generated server commands using the official SDK, all four tools and the decision lifecycle. Actual agent-host sessions and remote CI are separate outcomes and must be verified independently. See [validation](VALIDATION.md).

## 中文要点

v1.0 保留 Codex 默认行为，并增加 `--client claude-code|opencode|deepseek-harness`，用于 `init`、`doctor` 和 `uninstall`。三者共用 MCP 四个工具、对齐门槛和项目记录；提供原生 MCP、技能和项目指令，暂没有自动补丁守卫，也不生成 Codex 回合绑定。

Claude Code/OpenCode 在目标项目重启后检查 MCP 和技能。DeepSeek 必须使用安装结果中的 `dsh --profile web --patch <配置绝对路径>` 并选择正确工作区；一个进程内该服务始终绑定同一项目，不会修改全局 DSH 配置。

OpenCode 自动接入唯一已有的 `opencode.json` 或 `opencode.jsonc`，两种扩展名均支持注释和尾随逗号；两者均不存在时创建 `opencode.json`。初始化和卸载保留无关值与周边注释，编辑边界的空白可能变化，被替换的托管服务值内部注释可能移除。两个文件同时存在、文件名与归属记录不一致、重复键或语法错误时，先报告冲突，不写入配置；请先手动整理。无需自动管理时仍可使用上方手动示例。

重复安装保留无关配置；同名非托管项或已修改文件会提示冲突；卸载保留用户修改与全部记录。`doctor` 只诊断文件，不代表宿主已信任、加载成功或 Agent 实际遵循流程。真实宿主验收尚待分别执行。

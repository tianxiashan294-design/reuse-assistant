# Reuse Assistant

[English](README.md)

让编码 Agent 在写新代码之前，先确认有没有可以复用的实现。

Reuse Assistant 会搜索当前项目、公开代码仓库和包注册表，读取固定版本的证据，并记录 Agent 为什么选择使用依赖、改编代码、参考设计或自行实现。它通过共享的 MCP 服务和 CLI，支持 **Codex、Claude Code、OpenCode 和 DeepSeek Harness**。

## 这个项目能做什么

- 查找项目中已有的相关代码，以及 GitHub、GitLab 和包注册表中的公开实现。
- 读取文档、许可证信息和指定源码，为已支持的语言提供代码结构上下文。
- 帮助 Agent 结合完整需求、接入成本和现有架构比较候选方案。
- 记录选择、实施和验证结果，同时保留来源失败与覆盖范围限制。

具体判断、项目修改和测试由你的编码 Agent 完成，Reuse Assistant 负责提供证据并保存决策过程。详细能力见[来源覆盖](docs/SOURCES.md)和[证据与对齐说明](docs/ALIGNMENT.md)。

## 环境与配置

| 环境 | 用途 |
|---|---|
| Git | 克隆源码仓库 |
| Node.js 22 及以上，附带 npm | 安装依赖、构建和运行服务 |
| 支持的编码 Agent | 使用 MCP 工具与 `reuse-first` 技能；也可以单独使用 CLI |
| 网络连接 | 安装依赖与检索公开来源；完成安装后可用 `--scope local` 离线检查项目 |

Reuse Assistant 无需额外的模型 API Key。编码 Agent 自身的账号或模型服务按其正常方式配置即可。

### 从源码安装

```sh
git clone https://github.com/tianxiashan294-design/reuse-assistant.git
cd reuse-assistant
npm ci --ignore-scripts
npm run build
node dist/src/cli.js --help
```

下文命令均在这个源码目录中运行。把 `/absolute/project` 替换为你希望 Agent 操作的目标项目绝对路径。Windows 可使用带引号的路径，例如 `"C:\projects\my-app"`。

### 可选的访问令牌

公开检索可以不配置令牌，访问权限和频率仍受各服务限制。如需使用 GitHub 或 GitLab 令牌，在启动 Agent 或 CLI 的环境中设置 `GITHUB_TOKEN` 或 `GITLAB_TOKEN`。

例如，在 PowerShell 中：

```powershell
$env:GITHUB_TOKEN = "你的令牌"
```

在 POSIX shell 中：

```sh
export GITHUB_TOKEN="你的令牌"
```

需要 GitLab 时，以相同方式设置 `GITLAB_TOKEN`。生成的配置引用环境变量，不会保存令牌值。

## 接入编码 Agent

选择客户端后运行 `init`。例如，接入 Claude Code：

```sh
node dist/src/cli.js init --project "/absolute/project" --client claude-code
```

| 客户端 | `--client` 参数 | 初始化后的操作 |
|---|---|---|
| Codex | `codex` | 打开并信任目标项目，然后新建会话 |
| Claude Code | `claude-code` | 在目标项目重启，按需批准 MCP 服务，并用 `/mcp` 检查 |
| OpenCode | `opencode` | 在目标项目重启，检查 MCP 状态和技能列表 |
| DeepSeek Harness | `deepseek-harness` | 按下方方式加载生成的 Cordis 配置启动 |

初始化会写入项目级 MCP 配置和 `reuse-first` 技能；Claude Code、OpenCode 和 DeepSeek 还会获得项目指令入口。已有无关配置会保留，同名非托管项会提示处理。多个客户端可以共用一个项目的记录。

**DeepSeek Harness** 需要在目标项目目录中，使用 `init` 返回的配置启动：

```sh
dsh --profile web --patch "/absolute/project/.dsh/reuse-assistant.cordis.patch.yml"
```

将目标项目选为会话工作区。这个服务在同一进程内始终绑定该项目；切换到其他项目时，使用独立进程和对应配置。

**OpenCode** 自动接入已有的 `opencode.json` 或 `opencode.jsonc`，支持注释和尾随逗号；两者均不存在时创建 `opencode.json`。如果两个文件同时存在，请先整理为一个配置。内容保留规则和可选的手动接入见[客户端指南](docs/CLIENTS.md)。

**Codex** 可以选择启用 hooks，用当前回合的绑定检查受支持的补丁工具：

```sh
node dist/src/cli.js init --project "/absolute/project" --client codex --hooks
```

在 Codex 中审核并信任生成的 hooks。守卫覆盖声明的补丁工具，shell 写入不在覆盖范围内。其他客户端通过 MCP、技能和项目指令执行流程，没有自动补丁守卫。

### 检查与卸载

将命令中的客户端参数换成你实际使用的客户端：

```sh
node dist/src/cli.js doctor --project "/absolute/project" --client claude-code
node dist/src/cli.js uninstall --project "/absolute/project" --client claude-code
```

`doctor` 检查文件和预期配置；实际是否加载成功，需要在 Agent 内确认下方四个工具和 `reuse-first` 技能。卸载会移除生成的接入项并保留项目记录；已修改文件的处理方式因客户端而异，详见[客户端指南](docs/CLIENTS.md)。配置变动后重启 Agent；卸载 DeepSeek 接入后，启动时去掉对应的 `--patch` 参数。移动 Reuse Assistant 源码目录后，重新运行 `init` 更新路径。

其他 MCP 客户端可配置一个 stdio 服务：命令为 Node 可执行文件，参数为 `/absolute/reuse-assistant/dist/src/cli.js mcp --project /absolute/project`，每个参数使用独立的数组项。配置文件位置与更多操作见[客户端指南](docs/CLIENTS.md)。

## 如何使用

完成接入后，让 Agent 按复用流程处理任务。例如：

> 帮我加入后台任务调度。先检查项目现有实现和已有库，阅读合适的候选，记录选择后再开始实现。

`reuse-first` 技能会引导 Agent 完成检索、取证、整体任务对齐和实施前决策。随后由 Agent 修改项目、运行测试，并记录 `applied` 与 `verified` 结果。小修复可以先做本地检查。

| MCP 工具 | 用途 |
|---|---|
| `check_reuse` | 搜索本地代码和选定的公开来源 |
| `inspect_candidate` | 读取固定版本的文档、许可证和源码证据 |
| `assess_alignment` | 核验证据引用、完整需求和接入计划 |
| `record_decision` | 记录选择及其 planned、applied、verified 阶段 |

也可以直接使用 CLI：

```sh
node dist/src/cli.js check --project "/absolute/project" --task "加入后台任务调度" --query "in-process task scheduler" --ecosystem javascript --json
```

加上 `--scope local` 可仅搜索项目。复杂约束、对齐契约和决策参数通过 `--input request.json` 传入；`--input -` 从标准输入读取 JSON。完整命令列表可通过 `--help` 查看。

记录保存在目标项目的 `.reuse-assistant/` 中，初始化会将它加入 `.gitignore`。这些任务记录保留在本地；对外检索使用公开的技术词。报告会区分搜索失败、零结果和覆盖不完整，检索结果不代表穷尽所有实现。

## 开源使用与贡献

本项目采用 [MIT 许可证](LICENSE)，可按其条款使用、修改、分发和商用。分发副本或实质性代码时，保留原有版权和许可声明，以及适用的[第三方归属说明](THIRD_PARTY_NOTICES.md)。

参与贡献时，先 Fork 仓库、创建分支，完成修改后提交 Pull Request。提交前运行：

```sh
npm run check
npm test
```

说明要解决的问题、修改内容和验证方式。引入上游代码时，记录固定版本、原始归属和所做修改。项目约定见[贡献指南](CONTRIBUTING.md)与[架构说明](docs/ARCHITECTURE.md)；问题和建议可通过 [GitHub Issues](https://github.com/tianxiashan294-design/reuse-assistant/issues) 提交。

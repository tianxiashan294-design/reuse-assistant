# Reuse Assistant：AI 编码前的复用检查

[English](README.md)

目标是减少 AI 不必要的重复实现：先查当前项目，再找已有依赖、代码和设计；阅读证据后选择复用或自建，最后记录实际集成与验证结果。

当前为 v1.0.0，官方源码仓库是 [tianxiashan294-design/reuse-assistant](https://github.com/tianxiashan294-design/reuse-assistant)。项目尚未发布到 npm，请使用本仓库源码，不要仅凭同名 `npx` 包安装。

v1.0 新增 **Claude Code、OpenCode、DeepSeek Harness** 的项目安装、诊断和选择性卸载，保留 Codex 默认行为。全部客户端共享核心和 MCP 四个工具；新接入提供原生 MCP、技能和项目指令，自动补丁守卫目前仍为 Codex 专属。详见[客户端接入与限制](docs/CLIENTS.md)。

最终目标是**全代码语言、全平台搜集**。第二版增加 6 个搜索源；第三版增加有预算的分页召回，后续页失败时保留已有候选。长期方向和后续顺序保存在[路线图](docs/ROADMAP.md)，当前实际能力见[来源矩阵](docs/SOURCES.md)。

第四版增加**代码语段与整体任务对齐**：JS/TS 家族按 AST 切分函数、类和方法，记录父级、哈希、调用和依赖事实；开启 `alignment` 契约后，新增 `assess_alignment` 核验全部任务/约束、语段引用、架构依赖规则和替代方案。缺项或冲突会阻止决策，语义判断仍明确标记为宿主报告。提示词、接口示例和语言限制见[对齐说明](docs/ALIGNMENT.md)。本次没有新增语言检索源。

第五版增加**跨文件定义关联与调用上下文确认**：在同一份 inspection 内，关联相对导入、显式重导出和稳定顶层函数的直接调用。`analysis.linkage` 给出目标语段及未解析原因；选择调用方时必须同时选择已确认的被调用语段和经过的模块，对齐提示返回已读调用方和缺口。遮蔽、赋值、歧义、截断、外部包及动态调用保守降级；部分覆盖须明确承认，unknown/conflict 要求继续阻止采用。语言源数量保持原有范围。

第六版增加 **Python、Go、Rust 代码结构分析**：固定 Tree-sitter WASM 语法文件随包分发，识别函数、类型及父级模块，保留 UTF-16 偏移、行号、哈希、导入与有界调用/控制/写入事实。无需安装三种语言的工具链、本机编译或运行时下载。JS/TS 沿用 Babel 与现有定义关联；新语言的模块和调用目标仍明确未解析，错误或截断代码降级文本，继续遵守共享预算和对齐门槛。本轮扩展代码取证能力，未增加包检索来源；详见[语言覆盖](docs/ALIGNMENT.md)。

第七版同时增加 **Java、C#、C、C++ 结构取证**与两种来源：**Hex** 的包名/描述关键词搜索，以及 **pub.dev** 官方有限名称表匹配。两者均提供固定发布版本元数据并保留代码对应缺口；pub 明确属于 `name_search`，不冒充全文需求搜索。可选 `--ecosystem dart|flutter|elixir|erlang` 或 `--source pub --source hex`。新增四份官方 WASM 连同许可和哈希随包分发；预处理、`.h` 语言歧义以及非 JS/TS 定义目标仍明确未解析。详见[来源说明](docs/SOURCES.md)。

第八版优先补充 **PHP、Ruby、Kotlin、Swift、Bash、Lua** 的结构取证：六份固定上游 WASM 随包分发，支持声明/父级、导入或加载语法，以及有界调用、控制和写入事实。现有运行依赖、共享预算和错误/截断降级保留，CLI/MCP 共用核心；新语言调用和模块目标仍未解析。当前共覆盖 JS/TS 家族及十三种 WASM 语法。Dart 本轮继续提供文本取证，包检索来源未增加。具体扩展名与限制见[语言覆盖](docs/ALIGNMENT.md)。

## 启动

要求 Node.js 22+；本地已用 Windows、Node 24 验证。

```powershell
git clone https://github.com/tianxiashan294-design/reuse-assistant.git
cd reuse-assistant
npm ci --ignore-scripts
npm run build
node dist/src/cli.js --help
```

```powershell
node dist/src/cli.js check --project 'C:\你的项目' --task '加入后台任务调度' --query 'in-process task scheduler' --ecosystem python --json
```

复杂参数放在 JSON 文件里，用 `--input request.json` 传入。CLI 与 MCP 共用相同的核心与记录。

## 接入 Codex 与其他 Agent

```powershell
node dist/src/cli.js init --project 'C:\你的项目' --hooks
node dist/src/cli.js doctor --project 'C:\你的项目'
```

初始化会生成项目级 MCP 配置、自动发现的 `reuse-first` 技能，以及可选的 hooks。已有无关配置会保留；同名非托管配置会提示冲突。生成内容带有本机工程路径，移动工程后需要重新初始化。

在 Codex 中打开并信任目标项目，新开会话，再在宿主里审核、信任生成的 hooks。未受信任项目的本地配置和 hooks 会被 Codex 跳过，生成文件不等于已经激活。技能在新项目、功能或实质模块开发前执行完整检查；小修复先查相关本地代码。MCP 暴露 `check_reuse`、`inspect_candidate`、`assess_alignment` 和 `record_decision` 四个工具。

Codex 的写入检查使用当前会话/回合绑定和决策记录，覆盖声明的 `apply_patch`、`Edit`、`Write` 路径。**shell 写入、已有交互会话及其他未适配路径不在该检查覆盖内。** `doctor` 显示配置状态，不代表已经完成宿主信任或实际激活验证。

```powershell
node dist/src/cli.js uninstall --project 'C:\你的项目'
```

卸载保留检索、证据和决策记录，仅移除生成的接入项。新增客户端使用以下命令；`doctor` 和 `uninstall` 同样接受 `--client`：

```powershell
node dist/src/cli.js init --project 'C:\你的项目' --client claude-code
node dist/src/cli.js init --project 'C:\你的项目' --client opencode
node dist/src/cli.js init --project 'C:\你的项目' --client deepseek-harness
```

Claude Code/OpenCode 重启后检查原生项目配置；DeepSeek Harness 需按安装输出使用 `dsh --profile web --patch <配置绝对路径>`，不会自动读取项目 MCP JSON。OpenCode JSONC 配置需手动合并，自动安装不会覆盖它。新客户端暂不支持 `--hooks`；配置生成和离线 MCP 测试不等于真实宿主激活验收。[详细指南](docs/CLIENTS.md)包含手动配置、独立卸载和能力边界。

## 已实现的复用流程

1. 查已有代码、依赖与相关模块。本地扫描不再使用语言扩展名白名单，检查有数量/大小上限的 UTF-8 文本；二进制、其他编码、隐藏/依赖目录等仍有明确排除范围。匹配结果需要 Agent 阅读。
2. 从 GitHub、GitLab.com、npm、crates.io、Maven Central、NuGet.org、RubyGems、Packagist 发现候选。新增 Rust、JVM、.NET、Ruby、PHP 生态；GitLab 支持嵌套组、公开仓库 URL 精确核查及固定提交文件取证。小项目也能出现，热度只作辅助信号。
3. Python 通过 GitHub 和安装/项目元数据发现分发名，再用 PyPI 核验；不宣称 PyPI 需求全文搜索，也不假定仓库名等于 import 名或包名。
4. 对最多 3 个候选阅读固定提交或版本的文档、许可证声明和关键代码。可以指定 `src/file.ts#L100-L180`；同仓库多包使用 `npm:@scope/name` 等别名选定具体包。
5. 由当前 Agent 判断需求匹配、接入成本、运行负担和维护成本，记录 `planned`，再实施、记录 `applied`，验证后记录 `verified`。后两阶段通过 `previousDecisionId` 关联前一阶段。

工具不会运行候选代码或替 Agent 修改业务实现。`verified` 的验证命令与结果由宿主提供，工具不会把它冒充为独立执行过的测试。

默认 `--ecosystem auto` 查询全部已实现来源。可使用 `rust`、`java`、`dotnet`、`ruby`、`php` 等生态，或重复 `--source gitlab --source crates` 明确选择来源；MCP/JSON 使用 `sources: ["gitlab", "crates"]`。Go 当前只有仓库搜索。报告的 `sourcePlan` 显示已选/未选来源及能力限制。已经运行的 MCP 服务需要重新加载新构建，才会显示扩展参数。

搜索区分零结果、超时、限流和未查询；不完整的检索或候选证据需要明确确认后继续。普通检索默认预算 60 秒，深入读取另有预算。远程缓存默认 6 小时并显示时间，本地代码每次重新检查。需求、约束和依赖状态变化会使相关记录失效。

每个来源、每条查询默认最多读 **2 页**，可通过 `--max-pages 1`、`2` 或 `3` 调整；JSON/MCP 使用 `maxPages`。所有来源的第一页任务完成后再读后续页，最多四个工作任务并发，所有页共享总预算。多数来源每页 6 条；RubyGems 按官方固定页大小保留全部 30 条，避免跨页时漏掉原先被截去的条目。GitLab 精确 URL 和 PyPI 包名仍只核验一次。总候选短名单保持最多 30 条，各来源结果保留全部已读候选。

成功读取的搜索结果公开 `pagination`：页大小、成功页数、读取条目数、上游总数（如有）、`hasMore` 与停止原因。达到页数上限表示有限计划完成，仍可能有未读结果。后续页失败保留已有候选、错误和失败页码，标记覆盖不完整且不缓存；重复页也会明确停止并标记不完整。分页上限参与缓存隔离。上游总数和偏移排序可能变化，当前不提供快照或穷尽搜索。

查询按来源限制调整：npm 最多 64 字符，GitHub 连同筛选条件最多 256 字符。缩短查询会显示实际请求，并标记覆盖不完整。完成验证后的报告显示最新决策阶段及验证结果。

npm 元数据与仓库源码提交分别记录；若不能证明源码对应发布包，报告会明确标记关联未核实。

## 本地记录与配置

无需额外模型 API Key，语义判断沿用当前 Agent。`GITHUB_TOKEN`、`GITLAB_TOKEN` 可选，通过环境变量传入，分别只发往对应平台；不会把令牌值写入生成配置或决策记录。NuGet 支持限定官方主机和次数的区域跳转。

记录保存在目标项目 `.reuse-assistant/` 下，初始化会加入版本控制忽略规则。对外查询使用功能词和技术约束，本地源码在本地检查。

## 验证与后续

```powershell
npm run check
npm test
npm run smoke
npm run smoke:v2
npm run smoke:v3
npm run smoke:v7
```

离线测试、联网接口观察、Agent 实际使用和真实 Codex hooks 激活是不同验证层次。具体完成情况见[验证记录](docs/VALIDATION.md)，Node 22/24、Windows/Linux 的远程检查见 [GitHub Actions](https://github.com/tianxiashan294-design/reuse-assistant/actions)。架构、已知限制与扩展方法见[架构说明](docs/ARCHITECTURE.md)。

第二版的联网观察保存在 [live-smoke-v2.json](docs/live-smoke-v2.json)。第三版两页搜索观察保存在 [live-smoke-v3.json](docs/live-smoke-v3.json)，均保留历史失败。构建后可用 `node dist/test/live-smoke-v3.js github` 只重查该来源。长期继续扩展语言生态、代码平台、召回与证据关联；当前结果不代表已完成全平台覆盖。

MIT 开源；上游来源、固定提交和修改见[第三方归属](THIRD_PARTY_NOTICES.md)。

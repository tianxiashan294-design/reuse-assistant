# Reuse Assistant：AI 编码前的复用检查

[English](README.md)

目标是减少 AI 不必要的重复实现：先查当前项目，再找已有依赖、代码和设计；阅读证据后选择复用或自建，最后记录实际集成与验证结果。

当前为 v0.1.0 预览版，官方源码仓库是 [tianxiashan294-design/reuse-assistant](https://github.com/tianxiashan294-design/reuse-assistant)。项目尚未发布到 npm，请使用本仓库源码，不要仅凭同名 `npx` 包安装。

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

## 接入 Codex

```powershell
node dist/src/cli.js init --project 'C:\你的项目' --hooks
node dist/src/cli.js doctor --project 'C:\你的项目'
```

初始化会生成项目级 MCP 配置、自动发现的 `reuse-first` 技能，以及可选的 hooks。已有无关配置会保留；同名非托管配置会提示冲突。生成内容带有本机工程路径，移动工程后需要重新初始化。

在 Codex 中打开并信任目标项目，新开会话，再在宿主里审核、信任生成的 hooks。未受信任项目的本地配置和 hooks 会被 Codex 跳过，生成文件不等于已经激活。技能在新项目、功能或实质模块开发前执行完整检查；小修复先查相关本地代码。MCP 暴露 `check_reuse`、`inspect_candidate` 和 `record_decision` 三个工具。

Codex 的写入检查使用当前会话/回合绑定和决策记录，覆盖声明的 `apply_patch`、`Edit`、`Write` 路径。**shell 写入、已有交互会话及其他未适配路径不在该检查覆盖内。** `doctor` 显示配置状态，不代表已经完成宿主信任或实际激活验证。

```powershell
node dist/src/cli.js uninstall --project 'C:\你的项目'
```

卸载保留检索、证据和决策记录，仅移除生成的接入项。其他 Agent 可先通过标准 MCP 和技能使用核心能力，专属自动触发与检查适配会逐步补充。

## 已实现的复用流程

1. 查已有代码、依赖与相关模块。本地是有数量/大小上限的词法检索，匹配结果需要 Agent 阅读。
2. 从 GitHub 和 npm 发现候选。小项目也能出现，热度只作辅助信号。
3. Python 通过 GitHub 和安装/项目元数据发现分发名，再用 PyPI 核验；不宣称 PyPI 需求全文搜索，也不假定仓库名等于 import 名或包名。
4. 对最多 3 个候选阅读固定提交或版本的文档、许可证声明和关键代码。可以指定 `src/file.ts#L100-L180`；同仓库多包使用 `npm:@scope/name` 等别名选定具体包。
5. 由当前 Agent 判断需求匹配、接入成本、运行负担和维护成本，记录 `planned`，再实施、记录 `applied`，验证后记录 `verified`。后两阶段通过 `previousDecisionId` 关联前一阶段。

工具不会运行候选代码或替 Agent 修改业务实现。`verified` 的验证命令与结果由宿主提供，工具不会把它冒充为独立执行过的测试。

搜索区分零结果、超时、限流和未查询；不完整的检索或候选证据需要明确确认后继续。普通检索默认预算 60 秒，深入读取另有预算。远程缓存默认 6 小时并显示时间，本地代码每次重新检查。需求、约束和依赖状态变化会使相关记录失效。

查询按来源限制调整：npm 最多 64 字符，GitHub 连同筛选条件最多 256 字符。缩短查询会显示实际请求，并标记覆盖不完整。完成验证后的报告显示最新决策阶段及验证结果。

npm 元数据与仓库源码提交分别记录；若不能证明源码对应发布包，报告会明确标记关联未核实。

## 本地记录与配置

无需额外模型 API Key，语义判断沿用当前 Agent。GitHub Token 可选，通过环境变量传入；不会写入生成配置或决策记录。

记录保存在目标项目 `.reuse-assistant/` 下，初始化会加入版本控制忽略规则。对外查询使用功能词和技术约束，本地源码在本地检查。

## 验证与后续

```powershell
npm run check
npm test
npm run smoke
```

离线测试、联网接口观察、Agent 实际使用和真实 Codex hooks 激活是不同验证层次。具体完成情况见[验证记录](docs/VALIDATION.md)，Node 22/24、Windows/Linux 的远程检查见 [GitHub Actions](https://github.com/tianxiashan294-design/reuse-assistant/actions)。架构、已知限制与扩展方法见[架构说明](docs/ARCHITECTURE.md)。

长期目标是在“避免 AI 重复造轮子”这条完整流程上整合现有工具，并适配更多 Agent 和生态。新增来源以实际复用收益为准。

MIT 开源；上游来源、固定提交和修改见[第三方归属](THIRD_PARTY_NOTICES.md)。

# 代码语段与整体任务对齐（v0.4）

目标是在采用局部实现前，把代码结构、整体任务和架构约束连成可追溯的证据链。例如重试函数每次都迅速返回，却不断重置超时、突破调用方的总时间预算：局部测试通过不足以证明系统改善。

## 工具的职责

`inspect_candidate` 自动返回 `analysis`，使用固定的 `@babel/parser@7.28.5` 静态解析 JS、TS、JSX、TSX（含 mjs/cjs/mts/cts）。它识别模块、函数、类、方法、接口及类型声明；注释、字符串和正则里的类似代码不会成为声明。语段包含稳定 ID、完整文件哈希、语段内容哈希、行区间、父级 ID、预览、语法调用、控制流计数及写入目标。行号相对原文件；offset 是相对所读文本的 UTF-16 索引，不是字节偏移。省略的预览可按 offset 从 inspection 中的代码内容读取。

证据还记录 import、re-export、require 和动态 import 边。相对导入提供规范化路径；未读取目标、非字面量加载、解析失败、截断和不支持的语言都保留缺口。本地 `inspect` 的 `paths` 可补读项目内调用方及依赖文件；失败仍公开。远程读取保持固定提交。

每份 inspection 的解析预算是 180 KB 源文本、100 个语段及 30,000 个 AST 节点；单文件沿用证据的 24,000 字符展示限制。达到限制报告 partial。README、目录和包元数据不能代替代码语段。文本 fallback 不声称具备结构边界。

## 开启对齐契约

CLI 与 MCP 参数一致，核心接口是 `ReuseAssistant.check/inspect/assess/decide`。例如 `check --input request.json --project PROJECT --json`：

```json
{
  "task": "复用共享重试实现并保留总时间预算",
  "queries": ["retryRequest"],
  "scope": "full",
  "constraints": ["CLI 与 MCP 必须共用核心逻辑"],
  "alignment": {
    "requirements": [{ "id": "shared-deadline", "description": "每次尝试共享调用方原始总截止时间" }],
    "forbiddenImports": [{ "from": "src/adapters/", "to": "src/store" }]
  }
}
```

核心自动纳入 task 和原始 constraint（`task`、`constraint:1` 等）；额外要求不能覆盖它们。契约参与上下文/缓存隔离。依赖规则使用**字面前缀**：from 匹配证据文件路径，to 匹配原始 specifier 或规范化相对目标；不是通配符或完整模块解析，不解析 tsconfig alias。

读取候选和上下文后，按 check 返回的 `alignmentPrompt` 调用 MCP `assess_alignment`，或 CLI `assess --input alignment.json`：

```json
{
  "checkId": "CHECK_ID",
  "choice": "reuse_local",
  "candidateIds": ["local:src/retry.ts"],
  "evidenceIds": ["INSPECTION_ID"],
  "segmentIds": ["MODULE_SEGMENT_ID", "FUNCTION_SEGMENT_ID"],
  "claims": [
    { "requirementId": "task", "verdict": "supported", "rationale": "根据实际读取的实现解释整体任务如何满足", "segmentIds": ["FUNCTION_SEGMENT_ID"] },
    { "requirementId": "constraint:1", "verdict": "supported", "rationale": "根据核心及调用方解释共享所有权", "segmentIds": ["MODULE_SEGMENT_ID"] },
    { "requirementId": "shared-deadline", "verdict": "unknown", "rationale": "尚未读取截止时间建立处，需补充证据", "segmentIds": ["FUNCTION_SEGMENT_ID"] }
  ],
  "alternatives": [
    { "kind": "keep_existing", "summary": "保留并扩展共享实现", "tradeoffs": "保留统一取消和预算，但需补充集成测试" },
    { "kind": "selected", "summary": "采用语段并调整共享接口", "tradeoffs": "说明对全部调用方、状态和运行成本的影响" }
  ],
  "integration": {
    "target": "共享 core 的重试接口",
    "compatibility": "保持调用方信号和原始截止时间",
    "validationPlan": "通过公共接口测试取消、重试耗尽及整体总截止时间"
  }
}
```

大写 ID 要替换为真实返回值；unknown 要补查后重新提交，不能直接采用。

## 决策门槛

- 每项要求都须说明，缺失、unknown、conflict 阻止采用。
- 语段来自当前 check 中引用的 inspection，候选身份对应；选择函数/方法须同时选择父级链至模块。
- 对全部引用代码上下文执行禁止依赖规则，不能只检查局部选中的函数。
- 必须有保留现有架构与所选方案两个不同替代方案，以及兼容性、集成位置和整体验证计划。
- planned 前重新核对本地证据哈希，源码变化须重新检查。applied/verified 保留原 alignmentId，允许实际集成修改代码。
- 部分检索、未读依赖等缺口须明确承认；`acknowledgeIncomplete` 无法覆盖 blocker。

ready 报告的 `alignmentId` 交给 `record_decision`，策略、候选及证据必须对应。每个 check 最多保留 30 份不可变报告；同一核心实例串行保存 inspection/assessment。

## 能力边界

ready 仅表示确定性结构检查通过。`judgment: host_reported` 表明需求含义、证据是否支持语义和方案好坏仍由宿主判断。语法调用不是解析后的调用图；写入不证明实际执行。别名、反射、虚调用、未读调用方和运行成本没有自动证明，也不证明全局最优。build_new 可先评估计划而没有代码引用；采用、改编、本地复用和设计参考要求代码证据。

未传 alignment 的历史调用继续原流程，不获得“对齐已确认”的声明。新版技能要求实质性工作传契约并读取辅助提示词；旧 MCP 进程须重载构建。结构化切分目前覆盖 JS/TS 家族，其他语言公开降级；已接入的七个语言生态的检索数量未增加。

离线接口测试、联网端点检查、宿主模型语义表现和真实桌面激活分别验收。自动测试未证明模型会稳定给出正确 supported 判断，也不执行候选代码或宿主报告的验证命令。

解析器参考：[Babel parser 官方文档](https://babeljs.io/docs/babel-parser)。固定版本及许可见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。

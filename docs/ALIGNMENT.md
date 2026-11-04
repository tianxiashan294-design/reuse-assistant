# 代码语段、跨文件定义与整体任务对齐（v0.8）

目标是在采用局部实现前，把代码结构、整体任务和架构约束连成可追溯的证据链。例如重试函数每次都迅速返回，却不断重置超时、突破调用方的总时间预算：局部测试通过不足以证明系统改善。

## 工具的职责

`inspect_candidate` 自动返回 `analysis`，使用固定的 `@babel/parser@7.28.5` 静态解析 JS、TS、JSX、TSX（含 mjs/cjs/mts/cts）。它识别模块、函数、类、方法、接口及类型声明；注释、字符串和正则里的类似代码不会成为声明。语段包含稳定 ID、完整文件哈希、语段内容哈希、行区间、父级 ID、预览、语法调用、控制流计数及写入目标。行号相对原文件；offset 是相对所读文本的 UTF-16 索引，不是字节偏移。省略的预览可按 offset 从 inspection 中的代码内容读取。

证据还记录 import、re-export、require 和动态 import 边。保留原有规范化 `resolvedPath`，新增 `resolution`、`targetPath` 和 `targetModuleId`；未读取目标、歧义、非字面量加载、解析失败、截断和不支持的语言都保留缺口。本地 `inspect` 的 `paths` 可补读项目内调用方及依赖文件；失败仍公开。远程读取保持固定提交。

每份 inspection 的解析预算是 180 KB 源文本、100 个语段及 30,000 个 AST 节点；单文件沿用证据的 24,000 字符展示限制。达到限制报告 partial。README、目录和包元数据不能代替代码语段。文本 fallback 不声称具备结构边界。

## Python、Go、Rust 结构覆盖

v0.6 在同一个核心分析流程中增加 `web-tree-sitter@0.27.1`，并分发固定官方语法 WASM：Python 0.25.0、Go 0.25.0、Rust 0.24.0。`assets/grammars/manifest.json` 保存版本、release URL、提交、SHA-256 和 ABI；原始许可随资产保存。解析不执行被检查的程序，不加载其 native bindings，不依赖本机语言工具链或运行时下载。首次使用时异步初始化，语法对象按三种语言缓存，每个文件的 parser/tree 在 finally 释放。

| 文件 | 结构语段 | 导入事实 | 当前限制 |
|---|---|---|---|
| `.py` | 函数、类、lambda；装饰器包含在声明范围内 | import、from（含相对模块）、future import | 不解析 Python 模块搜索路径、装饰器效果或动态加载 |
| `.go` | 函数、方法、类型/别名、匿名函数；方法的语法父级是模块 | 分组/别名/原始字符串 import | 不解析 go.mod/build tags、接收者类型与方法关联；含转义的 import 保留字面量并报告缺口 |
| `.rs` | 函数/签名、struct/union/enum、trait/impl、类型、模块、闭包、宏声明 | use 原文树、extern crate | 不展开宏/属性，不读取外部 mod，不解析 Cargo/cfg/trait dispatch |

`analysis.parsers` 可选数组记录每个成功解析的新语言文件及固定 parser/grammar 版本；旧记录继续可读，纯 JS/TS 的 `parser` 和语段 ID 保持不变。新语言 offset 同样是 UTF-16 字符串索引，行号从完整证据计算，中文/emoji/CRLF 已由公共接口样例核验。函数内嵌声明使用最近声明作为父级；调用事实归属最近语法声明，不代表初始化、装饰器或闭包的执行时序。

三种新语言静态收集调用和常见显式赋值/声明目标，以及 await、raise、except、return、if/分支等语法节点计数；它们不是完整控制流、数据流或错误传播分析。`analysis.imports` 保留原始模块说明，`resolution: unsupported` 不进入 JS 路径解析；静态调用以 `unresolved` 边保留原因。即使新语言结构 `coverage: complete`，`linkage.coverage` 仍为 partial，必须承认关联缺口；禁止依赖规则仍检查实际记录的 import 前缀，不能代替完整模块解析或源代码审计。

所有解析器共用原有每 inspection 的 180 KB、100 语段和 30,000 节点预算（Tree-sitter 遍历 named nodes），调用边共用 300 条输出上限，每语段调用/写入最多各 60 条。WASM 单次 parse 另有 1 秒 progress 截止；初始化和静态资产加载不计入该 parse 截止。ERROR/missing 语法、加载异常、超过解析截止和截断均公开降级，不能用恢复树冒充完整结构。超预算保留已得到的事实并显示 partial。语法版本之外的新语言特性可能降级为文本。

## Java、C#、C、C++ 结构覆盖

v0.7 沿用相同 runtime，新增官方固定 WASM：Java 0.23.5、C# 0.23.5、C 0.24.1、C++ 0.23.4。七种 WASM 语法按语言缓存，资产无需本机编译或运行时联网。版本、提交、SHA-256、ABI 和完整原始 MIT 许可保存在 `assets/grammars`。旧三种 WASM 和 Babel 的固定版本、预算与语段标识算法保留。

| 文件 | 结构语段 | 依赖事实与限制 |
|---|---|---|
| `.java` | 类、接口、enum、record、注解类型、方法、构造器、lambda | 普通/静态/通配符 import；不解析 classpath、继承/重载或注解处理 |
| `.cs` | namespace、类/接口/struct/record/enum/delegate、方法/构造器、属性/indexer/operator、局部函数和 lambda | using（含别名/static）；不求值条件编译，不解析项目/程序集/重载 |
| `.c`, `.h` | 函数定义、struct/union/enum、typedef | include 字面量；计算/转义 include 保留原文与缺口；不运行预处理器，`.h` 默认 C 并显式报告 C/C++ 歧义 |
| `.cpp/.cc/.cxx`, `.hpp/.hh/.hxx` | 函数/方法定义、class/struct/union/enum、namespace、template、类型别名/concept、lambda | include；不展开宏、模板或条件分支，不解析编译选项和 include 搜索路径 |

方法/函数的名称取自真实 name/declarator 字段链，不从参数或字符串猜测。C/C++ 原型和函数指针声明没有独立函数语段，仍保留在完整父模块证据中。C# 文件作用域 namespace 的语段只覆盖声明头，其后类型的语法父级仍为模块。Java/C# 方法调用与构造、C/C++ 调用、赋值/更新、显式 throw/catch/return/if 等保留语法事实；隐式行为、初始化时序和完整控制流未分析。所有新语言调用/导入保持 unresolved/unsupported，并继续参与父级门槛、禁止依赖前缀检查和缺口确认，不提供新语言跨文件定义关联。

## PHP、Ruby、Kotlin、Swift、Bash、Lua 结构覆盖

v0.8 复用原有 runtime，新增六份上游 release WASM：PHP 0.25.1、Ruby 0.23.1、Kotlin 1.1.0、Swift 0.7.3、Bash 0.25.1、Lua 0.5.0。共十三种 WASM 语法，与 JS/TS 共用核心预算和错误/截断降级。每份资产的固定 tag 提交、哈希、ABI 和原始 MIT 许可随包保存；不增加运行依赖、目标语言工具链或运行时联网。

| 文件 | 结构语段 | 依赖事实与限制 |
|---|---|---|
| `.php/.phtml` | namespace、class/interface/trait/enum、函数/方法、匿名函数、箭头函数和匿名类 | namespace use（含分组/别名）、include/require；PHP 代码须有 PHP tag，混合 HTML 按原语法保留；不解析 Composer、自动加载、trait/动态 dispatch 或文件作用域 namespace 语义归属 |
| `.rb/.rake/.gemspec` | module、class/单例类、方法/单例方法、lambda | 无接收者的 require/require_relative/load；不求值 metaprogramming、类重开、mixins、Ruby 搜索路径或普通 block 执行语义 |
| `.kt/.kts` | class/interface、object/匿名 object、函数、次构造器、initializer、类型别名和 lambda | import（含通配符，别名目标保留）；不解析 Gradle/classpath、扩展/重载、委托或协程行为 |
| `.swift` | class/struct/enum/actor/extension、protocol、函数/协议签名、init/deinit、subscript、类型别名和闭包 | 模块/成员 import；不解析 SwiftPM、扩展/重载/协议 dispatch、宏或条件编译 |
| `.sh/.bash` | 函数定义（含嵌套） | source/`.` 与 command 调用语法；`.sh` 采用 Bash 语法，不声称兼容所有 shell；不求值展开、eval、shell 搜索路径、子进程或重定向效果 |
| `.lua` | 命名/局部函数、方法与匿名函数 | require（含短字符串参数）；不解析 package.path/searchers、元表/动态加载或运行时 dispatch |

六种语言收集有界调用、常见显式赋值、return/if/分支/catch 等语法事实；Swift await/throw 也保留语法计数，不把 Kotlin suspend 或 Ruby raise 方法名当作已证实的运行语义。PHP/Ruby/Bash/Lua 加载参数仅对无转义/插值的简单引号字符串（Bash 另含简单 word）取出内容；其他形式保留原文并报告 dynamic/escaped 缺口，不猜目标。PHP 分组 use 保留共同前缀；依赖事实仍参与禁止前缀规则，但不能代替完整依赖审计。

导入保持 `unsupported`、调用保持 `unresolved`；结构 complete 不代表定义关联或语义 complete。语法版本不支持的有效新语法也可能降级文本，例如固定 Kotlin 语法对部分紧凑同一行类成员布局会报告 missing 分隔符；不使用恢复树冒充边界。Dart 尚未接入结构语法，继续文本证据。`isCodePath` 在结构分析与改编许可门槛之间共享，防止新增语言在取证后被旧扩展名列表拒绝。

## 跨文件定义关联

`analysis.linkage` 是同一份 inspection 内的有界静态证据，不自动扩展文件或网络读取。只有完整遍历、路径唯一的 JS/TS 文件可以提供目标。相对路径按已读文件匹配：`.js` 可对应 `.js/.jsx/.ts/.tsx`，`.mjs` 可对应 `.mjs/.mts`，`.cjs` 可对应 `.cjs/.cts`；无扩展名可匹配这些文件或目录的 index。多个可选目标一律报告 ambiguous，不猜测 tsconfig、package exports 或真实运行环境的优先级。

支持显式命名/默认导入、别名、显式命名重导出，以及顶层函数声明或 const 函数值的直接标识符调用。例如 `entry.ts` 中的 `execute()`，通过 `bridge.ts` 的 `export { retry as run }` 指向 `worker.ts` 的函数时，调用边包含 `fromSegmentId`、`targetSegmentId` 和经过模块的 `viaModuleIds`。这些 ID 对应原有哈希语段；调用点保留文件、行号和 callee 文本。

当前采用保守的模块级规则：同名声明/参数/捕获/循环绑定出现在文件任意位置，都使该名称的关联失效；赋值、解构赋值或循环写入同样使其失效。这会产生有意的漏报，不声称精确词法作用域分析。eval/with 动态作用域禁用该模块的函数关联。嵌套函数、可变函数值、type-only/namespace 绑定、export-star、成员/构造/计算调用、外部包、动态加载及未确认导出保持 unresolved，并提供原因。显式重导出最多 10 跳，循环立即停止。

每份 inspection 最多输出 300 个调用点；达到上限会报告缺口。`analysis.coverage` 表示结构事实覆盖，`analysis.linkage.coverage` 表示上述有限关联是否完成：完整 AST 也可能只有部分调用关联。这里的 resolved 只表示静态定义证据链，不保证实际执行目标、运行次数、初始化时序或运行环境可加载性；complete 也不代表完整调用图或所有调用方。

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

核心自动纳入 task 和原始 constraint（`task`、`constraint:1` 等）；额外要求不能覆盖它们。契约参与上下文/缓存隔离。依赖规则使用**字面前缀**：from 匹配证据文件路径，to 匹配原始 specifier、规范化相对目标或已关联的实际 `targetPath`；不是通配符或完整模块解析，不解析 tsconfig alias。

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
- 对新版 evidence，选择调用方还须选择其已关联的直接被调用语段和全部 `viaModuleIds`；被调用语段沿用父级链要求，递归检查直到闭合。缺少已知语段是 blocker，明确承认覆盖不完整不能跳过。
- 评估的 `callContext` 返回与所选语段相关的已读调用方和调用边，提示词附带这些事实与缺口。未读调用方不自动成为已验证；旧 inspection 没有 linkage 时继续可读，重新评估会报告缺口，可通过再次 inspect 补齐。
- 对全部引用代码上下文执行禁止依赖规则，不能只检查局部选中的函数。
- 必须有保留现有架构与所选方案两个不同替代方案，以及兼容性、集成位置和整体验证计划。
- planned 前重新核对本地证据哈希，源码变化须重新检查。applied/verified 保留原 alignmentId，允许实际集成修改代码。
- 部分检索、未读依赖、未解析调用和关联预算等缺口传入 assessment.gaps，须明确承认；`acknowledgeIncomplete` 无法覆盖 blocker。若这些缺口使某项任务要求仍不确定，须提交 unknown 并补查，不能仅承认后继续。

ready 报告的 `alignmentId` 交给 `record_decision`，策略、候选及证据必须对应。每个 check 最多保留 30 份不可变报告；同一核心实例串行保存 inspection/assessment。

## 能力边界

ready 仅表示确定性结构检查通过。`judgment: host_reported` 表明需求含义、证据是否支持语义和方案好坏仍由宿主判断。定义关联不是完整词法/运行时调用图；写入不证明实际执行。反射、虚调用、未读调用方和运行成本没有自动证明，也不证明全局最优。build_new 可先评估计划而没有代码引用；采用、改编、本地复用和设计参考要求代码证据。

未传 alignment 的历史调用继续原流程，不获得“对齐已确认”的声明。新版技能要求实质性工作传契约并读取辅助提示词；旧 MCP 进程须重载构建。结构化切分覆盖 JS/TS 家族及 Python/Go/Rust/Java/C#/C/C++，其他语言公开降级；v0.7 另外增加 pub.dev 有限名称匹配和 Hex 包搜索，来源能力与结构语言数量分开记录。

离线接口测试、联网端点检查、宿主模型语义表现和真实桌面激活分别验收。自动测试未证明模型会稳定给出正确 supported 判断，也不执行候选代码或宿主报告的验证命令。

解析器参考：[Babel parser 官方文档](https://babeljs.io/docs/babel-parser)。固定版本及许可见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。

# 路线图状态

更新日期：2026-11-10（Asia/Shanghai）。状态依据当前实现及公共接口验证，长期范围见[原路线图](ROADMAP.md)。

| 工作 | 当前状态 | 剩余交付或验收 |
|---|---|---|
| 有限分页、失败重查、游标/备用 | GitLab keyset/Link 与 NuGet 官方备用已实现并有独立实网观察 | 其他来源的官方续页/备用能力、更完整失败恢复；当前不是任意游标/主机遍历 |
| 跨语言查询策略 | 显式宿主变体已实现 | 自动翻译未实现；不声称变体覆盖所有概念 |
| 来源排序公平性 | 共享核心按来源名额分配已实现 | 扩大真实召回观察；公平分配不证明相关性最优 |
| 可复现召回样例 | 固定 JSON 样例与公共 core/CLI/MCP 检查已实现 | 随新来源扩展样例；当前非完整基准 |
| 新包生态 | Clojars、Hackage、MetaCPAN 已接入有界元数据搜索，Go 已接入显式模块核验。C/C++ 新增 Conan Center Index recipe 和 vcpkg 默认 baseline 的名称查找及固定目录取证 | Swift、R、Julia、Lua、OCaml 等。已接入来源的归档与源码对应仍有缺口，Go 全文发现与 C/C++ 描述搜索仍待扩展 |
| Dart/Flutter、Elixir/Erlang 取证 | 有限元数据与仓库证据 | 发布归档及源码对应核验 |
| 新代码平台 | 待实现 | Gitee、Codeberg/Forgejo、Bitbucket、SourceHut、自托管 GitLab；受控主机与凭据隔离 |
| 发布归档对应、Maven、NuGet | 有限证据 | 归档与提交关联、POM 继承/SCM、NuGet 来源映射 |
| 非 GitHub/GitLab 代码 | 待实现 | 新平台固定提交代码读取 |
| 多模块与文本编码 | 当前仅根清单/UTF-8 | 有界嵌套工作区指纹、更多编码及缺口 |
| 更多结构语言 | 十三种 WASM 与 JS/TS | Dart、Scala、SQL、PowerShell、R、Julia、Haskell 等固定语法资产与许可 |
| 作用域、项目配置、调用方 | 有限 JS/TS 模块关联 | 精确词法作用域、项目解析、完整调用方和外语种关联 |
| 新客户端原生守卫 | 仅 Codex 有守卫 | Claude Code、OpenCode、DeepSeek Harness 原生自动触发/守卫 |
| 平台与真实宿主 | Windows/Node 24 离线验证；在当前 Codex MCP 会话实网验证 Conan 与 vcpkg 的检索和取证 | 跨系统和 Node 版本、其他真实宿主会话及可复现模型行为评测；CI 配置不等于运行结果 |

每个新增来源均需共享核心、身份/版本、失败与覆盖说明、取证能力或明确缺口、必要公共接口检查和独立实网观察。完整语言/平台目标仍未完成；缺少运行环境的验收保持未验收，不以离线夹具代替。

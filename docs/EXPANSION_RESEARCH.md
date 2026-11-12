# 后续来源调研记录

2026-11-06，官方资料与只读端点调研。以下是实现候选及子任务报告的网络观察，**不是本项目已接入或已验收的声明**。上游代码只作为资料读取，没有执行。实现状态以 [ROADMAP_STATUS.md](ROADMAP_STATUS.md) 为准。

## 包生态

| 生态 | 官方能力与依据 | 取证边界 |
|---|---|---|
| Go | [代理协议](https://go.dev/ref/mod#goproxy-protocol)、[索引](https://index.golang.org/) | 代理是已知模块核验；索引是时间事件流，不是需求搜索。固定 info/mod/zip；vanity path 不猜仓库，h1 不等于 ZIP SHA-256。 |
| Conan | [搜索契约](https://docs.conan.io/2/reference/commands/search.html)、[官方目录](https://github.com/conan-io/conan-center-index) | 名称/recipe 搜索；固定 recipe 提交及 config.yml/conandata/conanfile 文本，不执行 Python，不把 recipe Git 提交当已发布 RREV。 |
| vcpkg | [registry](https://learn.microsoft.com/en-us/vcpkg/concepts/registries)、[版本文件](https://learn.microsoft.com/en-us/vcpkg/maintainers/registries) | 固定 baseline 名称匹配；port tree 不等于上游源码提交；不执行 CMake。 |
| Swift | [Swift.org 包目录说明](https://www.swift.org/packages/)、[PackageList](https://github.com/SwiftPackageIndex/PackageList) | 社区 URL 名称目录，不承诺描述全文/版本/import 身份。列表 Apache-2.0，库许可另读；不执行 Package.swift。 |
| Haskell | [Hackage API](https://hackage.haskell.org/api)、[搜索实现](https://github.com/haskell/hackage-server/blob/5a55e30d6861017cbecb949dcf71567d28a537ee/src/Distribution/Server/Features/Search/PkgSearch.hs) | JSON 元数据搜索返回有界名称集，soft/hard 候选限制 400/800；本地切页不是全匹配总量。固定 package version/cabal revision 与 hash；归档另读。 |
| R | [仓库格式](https://cran.r-project.org/doc/FAQ/r-devel/R-admin.html)、[PACKAGES 字段](https://search.r-project.org/R/refmans/tools/html/writePACKAGES.html) | 官方 DCF 名称/版本/许可目录，不假定有 Description；有界 gzip 解压与版本归档需实现。调研出现超时/fetch failed，未完成完整解析观察。 |
| Julia | [registry 格式](https://pkgdocs.julialang.org/v1.10/registries/)、[Pkg 协议](https://pkgdocs.julialang.org/dev/protocol/) | 固定 Registry/Package/Versions TOML；UUID、package tree 和 registry commit 分开记录。General MIT，包许可另读。 |
| Lua | [官方 manifest 说明](https://luarocks.org/docs) | manifest.json 名称/版本/arch；rockspec 文本只读。官方镜像可受控备用，需记录滞后；不求值 Lua。 |
| Clojure | [Clojars 数据 API](https://github.com/clojars/clojars-web/wiki/Data)、[固定搜索实现](https://github.com/clojars/clojars-web/blob/ee61c5bf2cf7b3b9cdc2ab01703f67dabbd8b846/src/clojars/web/search.clj) | JSON 需求搜索每页 24；固定非 SNAPSHOT 版本 POM，不能把最新 API SCM tag 附给旧版本。 |
| Perl | [MetaCPAN API](https://github.com/metacpan/metacpan-api/blob/master/docs/API-docs.md)、[服务说明](https://metacpan.org/about) | release 搜索保留 timed_out/failed shards/总数关系。固定 author/release，区分 distribution/module；该固定路径的响应 metadata 在 release 包装字段内。 |
| OCaml | [OPAM 格式](https://opam.ocaml.org/doc/Manual.html)、[官方目录及 CC0](https://github.com/ocaml/opam-repository) | 固定名称目录及 opam/descr/source checksum，不求值 filters/build 命令。名称命中后补描述不等于全文检索。 |

调研时返回成功的固定目录提交（后续仍应读取该提交本身，不把它当未来最新版本）：

| 仓库 | 固定 revision |
|---|---|
| microsoft/vcpkg | `054bd01bec7f31492ec9ac063740cc984a0fe59e` |
| conan-io/conan-center-index | `a766dcf91064bd30623f737b9c922d8433c5ea5a` |
| JuliaRegistries/General | `88dfb2e1c8a6f01941f29e2320e978eea87b4b94` |
| SwiftPackageIndex/PackageList | `cd2b7bc61fcb7b13fed3c0dc22f696fb04a0cae2` |
| ocaml/opam-repository | `09d5d784fabf965d4f373a06b852bb398a3c981e` |

目录 loader 应由 core 共享同轮 Promise、固定 revision/内容哈希/缓存时间和截断缺口；失败 Promise 可重读。大型 Git 目录用 tree 并检查 truncated，避免 Contents 的千项上限。生态版本比较独立处理，不用通用词法排序决定 latest。

## 代码平台

| 平台 | 可实现协议 | 认证与范围 |
|---|---|---|
| Gitee | [官方 Swagger](https://gitee.com/api/v5/swagger_doc.json)：仓库搜索、commit、contents(ref)、tree/blob | 匿名公开读取先行；文档 token 是 query 参数，Bearer 尚未核实。调研搜索 200 但为空；不可据此声称无实现。 |
| Codeberg/Forgejo | [Forgejo API](https://forgejo.org/docs/latest/user/api/usage/)、[Codeberg Swagger](https://codeberg.org/swagger.v1.json)：repo search、commit、contents(ref) | 单实例；管理员可禁用 API。调研搜索 200，有 Link/总数；观察到的限流头不是永久承诺。 |
| 自托管 GitLab | [官方认证](https://docs.gitlab.com/api/rest/authentication/)；复用 project/keyset/commit/files/tree | 仅显式配置实例，精确 origin/API path 的凭据隔离；认证后仍保持公开过滤。 |
| Bitbucket | [仓库](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-repositories/)、[提交](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-commits/)、[源码](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-source/) | 明确工作区或已知仓库；全局 repositories 调研返回 404。旧代码搜索将在 2026-11-15 移除，不能新接旧端点，见[变更记录](https://developer.atlassian.com/cloud/bitbucket/changelog/)。 |
| SourceHut | [官方 GraphQL schema](https://docs.sourcehut.org/git.sr.ht/)：用户范围 repository 列表、已知仓库、固定 commit/path/TextBlob | 顶层列表不是全局搜索；只读查询实际返回 401 要求 Bearer。未核实数字限流，保留缺口；TextBlob 上限 128 KiB。 |

受控实例配置只保存 provider/baseUrl/tokenEnv，不保存 token；不从候选 URL 自动增加受信主机。仓库身份必须包括实例。拒绝跨主机重定向和任意 raw/download URL 凭据传播。新 provider 需同时更新 discovery dispatch、repository identity、inspection dispatch 和 capability，不能只添加来源枚举。

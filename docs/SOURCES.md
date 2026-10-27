# Source coverage in v0.2

The long-term target is all programming languages and platforms; this release implements the finite source set below. `coverage: complete` means the selected bounded plan completed, not that every platform, language or suitable implementation was searched. `sourcePlan` lists supported capabilities, limitations and selection state; `sources` retains actual requests and failures.

| Source | Discovery | Inspection | Limits |
|---|---|---|---|
| GitHub | Public repository/README search | Commit-pinned files/directories | First 6 results; not global source-code search |
| GitLab.com | Public name/path/description substring search; exact public project URL lookup | Commit-pinned files/directories and code ranges, nested groups | First 6 newest search matches; directory listings capped at 100; self-hosted instances unsupported |
| npm | Package search | Published version metadata; GitHub/GitLab evidence when associated | Query at most 64 characters; first 6 results |
| PyPI | Known distribution names | Version metadata; associated repository evidence | No PyPI full-text discovery; names must come from real project/install evidence |
| crates.io | Rust package search | Fixed version metadata and associated repository evidence | First 6 results; repository HEAD may differ from release |
| Maven Central | Coordinate query syntax | Fixed version POM as text | First 6 results; automatic SCM/license/parent interpretation not implemented |
| NuGet.org | Listed stable package search | Selected version metadata from discovered registration index/pages; leaf/catalog compatibility fallback | First 6 results; at most 4 registration pages; dynamically discovered service addresses; no archive extraction |
| RubyGems | Gem search | Version and platform metadata; associated repository evidence | Retain first 6 results of the first page; source/release association unverified |
| Packagist | Composer package search | Stable version metadata and fixed `source.reference` when supplied | First 6 results; full package API has a 2 MB limit and an upstream cache of up to 12 hours |

Package evidence without a supported repository is explicitly partial. Missing README/license files, failed code reads, unknown SCM and unverified package/source correspondence remain visible. Packages in the same repository keep distinct aliases and versions. Repository identities include the hosting platform.

## Selection

`ecosystem: auto` (default) searches all implemented sources. `javascript`, `python`, `rust`, `java`, `dotnet`, `ruby`, and `php` select GitHub + GitLab and the matching registry. `java` includes the JVM package ecosystem used by Kotlin and Scala. `go` currently selects repository search only. Explicit `sources` override ecosystem routing. `scope: local` performs no network requests.

```powershell
node dist/src/cli.js check --project . --task '查找 Rust JSON 库' --query serde_json --ecosystem rust --json
node dist/src/cli.js check --project . --task '跨平台查找 JSON 实现' --query json --source gitlab --source crates --source maven --json
node dist/src/cli.js check --project . --task '核查 Eigen 仓库' --query https://gitlab.com/libeigen/eigen --source gitlab --json
```

The same MCP `check_reuse` input uses `sources: ["gitlab", "crates"]`. Existing MCP processes must reload the new build to expose the new schema. The three tool names and decision lifecycle are unchanged.

Source selection is part of cache/decision context. Local code is always searched freshly. Automatic routing of exact scoped npm names applies unless explicit sources override it. Remote workers are bounded at four under one overall deadline; queued sources receive explicit timeout results if their budget expires.

## Transport and evidence policy

Optional `GITHUB_TOKEN` and `GITLAB_TOKEN` stay on their own hosts. The Codex installer forwards environment variable names, never literal tokens. Reads use HTTPS and an allowlist. Only NuGet redirects between its supported official global/regional hosts are followed, at most three per attempt within the same request deadline. Other redirects are rejected. Discovery never executes package or repository code.

Local discovery considers UTF-8 text with any file extension, including extensionless files. It excludes binary/non-UTF-8 files, symlinks, hidden/dependency/build directories and `.env` files. Limits are 1,200 scanned files, 180 KB per file, 30 raw matches, and 8 local shortlist entries. The root manifest fingerprint covers additional ecosystems and .NET project files; nested workspace manifests are not all fingerprinted.

## Official protocol references

- GitLab project filtering, search ordering and exact project lookup: [Projects API](https://docs.gitlab.com/api/projects/). File content and commit references: [Repository files API](https://docs.gitlab.com/api/repository_files/).
- crates.io search: [Cargo registry web API](https://doc.rust-lang.org/cargo/reference/registry-web-api.html).
- Maven coordinate queries and result fields: [Maven Central REST API](https://central.sonatype.org/search/rest-api-guide/).
- NuGet endpoint discovery: [Service index](https://learn.microsoft.com/en-us/nuget/api/service-index), [search](https://learn.microsoft.com/en-us/nuget/api/search-query-service-resource), [package metadata](https://learn.microsoft.com/en-us/nuget/api/registration-base-url-resource), and [HTTP status behavior](https://learn.microsoft.com/en-us/nuget/api/overview).
- RubyGems search and exact version/platform metadata: [RubyGems.org API](https://guides.rubygems.org/rubygems-org-api/).
- Composer package search, full metadata and upstream cache behavior: [Packagist API](https://packagist.org/apidoc).

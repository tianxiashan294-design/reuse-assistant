# Changelog

## 0.2.0 — 2026-10-27

- Add GitLab.com, crates.io, Maven Central, NuGet.org, RubyGems and Packagist discovery in the shared core.
- Add ecosystem and explicit source selection to core, CLI and MCP, with public capability/coverage plans and source-aware caching.
- Read GitLab evidence at fixed commits, new registry version metadata, Maven POMs and Packagist source references; retain missing evidence and failed requests.
- Search local UTF-8 text independently of programming-language file extensions and expand root dependency manifest fingerprints.
- Handle official NuGet regional redirects with bounded host checks; isolate platform credentials and forward optional GitLab credentials in generated configuration.
- Fix cancellation of queued source requests after the global deadline; retain a representative for each returning source in the shortlist.
- Add public core and real MCP regression coverage plus a separate live observation command. See [validation](docs/VALIDATION.md), [source limits](docs/SOURCES.md) and the [long-term roadmap](docs/ROADMAP.md).

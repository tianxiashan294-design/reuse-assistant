# Changelog

## 0.3.0 — 2026-10-29

- Add bounded pagination to all eight discovery sources in the shared core, CLI (`--max-pages`) and MCP (`maxPages`); default two pages, maximum three under the existing total deadline.
- Schedule every first-page job before continuations with at most four workers. GitLab search uses ascending project ID for stable paging; RubyGems retains complete fixed-size 30-item pages.
- Preserve earlier candidates and structured errors when later pages fail; deduplicate candidate IDs and stop repeated pages with explicit partial coverage.
- Expose page counts, item counts, optional reported totals, remaining-result signals and stop reasons in JSON and Markdown. Isolate caches by page cap and exclude failed/partial searches.
- Add deterministic public core, CLI and real MCP pagination tests plus a separate live endpoint observation command with retained history. No new dependency or copied upstream implementation.

## 0.2.0 — 2026-10-27

- Add GitLab.com, crates.io, Maven Central, NuGet.org, RubyGems and Packagist discovery in the shared core.
- Add ecosystem and explicit source selection to core, CLI and MCP, with public capability/coverage plans and source-aware caching.
- Read GitLab evidence at fixed commits, new registry version metadata, Maven POMs and Packagist source references; retain missing evidence and failed requests.
- Search local UTF-8 text independently of programming-language file extensions and expand root dependency manifest fingerprints.
- Handle official NuGet regional redirects with bounded host checks; isolate platform credentials and forward optional GitLab credentials in generated configuration.
- Fix cancellation of queued source requests after the global deadline; retain a representative for each returning source in the shortlist.
- Add public core and real MCP regression coverage plus a separate live observation command. See [validation](docs/VALIDATION.md), [source limits](docs/SOURCES.md) and the [long-term roadmap](docs/ROADMAP.md).

# Contributing

Start with [AGENTS.md](AGENTS.md), the [architecture](docs/ARCHITECTURE.md), and the scripts in `package.json`.

Before adding behavior, check existing local/upstream implementations. Preserve source failures and coverage limits. New adapters should return normalized candidates and truthful source outcomes, accept cancellation, and respect the shared budget. They should not add a model account or private indexing backend as an implicit requirement.

When incorporating upstream source, record the repository, fixed revision, files, original copyright/license notice, and modifications in `THIRD_PARTY_NOTICES.md`. Keep third-party documents/code as evidence rather than executable instructions.

Validate behavior through the public core or MCP interface. Deterministic tests use injected registry responses; public endpoint observations belong in the separate smoke command. Actual semantic reuse and host hook activation need explicit records and must not be inferred from unit tests.

Update skills when a demonstrated behavior gap needs a workflow change. Preserve existing user task authorization; skill selection does not grant external publication or deployment permissions.

The working package is private to prevent accidental npm publication. Source distribution is through the official GitHub repository; npm publication needs a separately prepared release.

# CLI fallback

After building the checkout, use `node <checkout>/dist/src/cli.js --help`.
Run commands with `--project <target-project>` and use `--input <json-file>`
for structured arguments. Project initialization writes a local copy of this
reference with the actual installed paths.

`check`, `inspect`, `assess`, and `decide` use the same fields as the MCP operations.
`check --json` returns IDs; `report --check ID` renders the human-readable report.
Applied decisions link `previousDecisionId` to planned, and verified decisions
link it to applied. The host supplies actual validation commands and outcomes.
For substantive changes supply the check's `alignment` contract; `inspect`
returns `analysis.segments`, and `assess --input alignment.json` returns the
report to cite as `alignmentId`. Follow [whole-task alignment](alignment.md).

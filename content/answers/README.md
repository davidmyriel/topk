# TopK answer pages, draft batch (2026-09-10)

Twelve draft "answers" pages plus the research report they came from. Each `.mdx` ends with an `{/* EDITOR NOTES */}` block containing sources, verification status, and open questions for the refining agent. Read `00-research-report.md` first.

| Tier | Page | Status |
|---|---|---|
| 1 | why-does-filtered-vector-search-return-fewer-results | ready to refine |
| 1 | how-do-i-combine-keyword-and-vector-search | ready to refine |
| 1 | how-do-i-isolate-data-per-customer | ready to refine |
| 1 | why-cant-i-find-a-document-right-after-writing-it | ready to refine |
| 1 | how-do-i-search-scanned-documents-with-colpali | ready to refine |
| 2 | why-does-my-vector-database-need-so-much-ram | needs cold-start caveat confirmed |
| 2 | why-does-building-my-vector-index-take-hours | confirm no add-index-to-existing-collection |
| 2 | can-i-get-real-search-ranking-from-postgres | limits section is load-bearing |
| 2 | how-do-i-build-agent-memory-that-favors-recent-and-stays-private | `decay`/`saturate` Rust-only; no integrations |
| 2 | how-do-i-get-facet-counts-alongside-search | `quantile`/`count_distinct` Rust-only |
| 3 | can-i-replace-elasticsearch-for-app-search | HOLD: `topk-es` unpublished |
| 3 | how-do-i-give-my-coding-assistant-persistent-memory-and-a-repo-index | HOLD: no MCP/provider on-ramp |

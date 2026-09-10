# Focused message: five-persona synthesis

Date: 2026-09-10. Inputs: DevRel, marketer, PM, engineer, ML researcher, each reading `00-research-report.md`, the 12 answer pages, and the repo.

## Verdict

Four of five pick the same message. The engineer picks read-your-writes as the *first* proof point because it is verifiable in five minutes, and agrees filtered search becomes the hero once a benchmark exists.

**Message**: Filter first, rank second. Ask for 10 results with a WHERE clause, a keyword, or a tenant, and get 10.

**Category**: retrieval engine, not vector database.

**Positioning** (marketer): For teams shipping search inside multi-tenant SaaS and agent products who have outgrown pgvector or a RAM-bound vector DB. TopK runs filters, BM25, dense/sparse/multi-vector scoring, and aggregation in one query plan at object-storage prices. Unlike Pinecone, Qdrant, Weaviate, Turbopuffer, which hold indexes in RAM, bolt keyword search on as a second index, or lack multi-vector and SQL.

**Why this one**
- Largest cross-repo demand: pgvector #259 (87 comments, 61 reactions), ~47 Milvus "less than topk" issues, ES #106994, Weaviate #2393, Chroma #1330 (78 reactions).
- Everything it needs ships in Python, JS, and SQL today. Nothing Rust-only is load-bearing (PM).
- Structurally hard on HNSW; research solutions (Filtered-DiskANN, ACORN) handle label-equality filters only, TopK accepts arbitrary predicates (ML researcher).
- One mechanism a developer can repeat in a sentence (DevRel).

**Hero examples**: filtered search (#1), hybrid in one query (#2), partition per tenant (#4). Read-your-writes (#8) as the verifiable fourth.

## Corrections to the drafts (from this round)

1. **Overclaim on competitors.** Qdrant, Weaviate, and ES 8+ already pre-filter kNN. Only pgvector and Milvus reliably fail. Page 1 must name pgvector and Milvus, not "most vector databases" (engineer).
2. **"True top-k" is misleading** when the vector leg is ANN at 95%. Say "exact over the candidate set" or "recall does not degrade under selectivity" (engineer, ML researcher).
3. **ColPali doc cap.** ColPali v1 page = 1030 patches x 128 x f16 = 264 KB, over the 200 KB limit in `docs/limits.mdx`. Page 5 must recommend f8/u8 or patch pooling, not f16 (engineer).
4. **JS partition APIs are documented** at `docs/sdk/topk-js/index.mdx` lines 133-190. Research report and page 3 notes are stale. Remaining gap: answer pages are Python-only (PM).
5. **Hybrid score normalization.** Examples mix bounded MaxSim with unbounded BM25. `saturate()` (Rust-only) is the fix. Literature: Bruch et al., TOIS 2023, normalization matters more than fusion choice (ML researcher).
6. **ES refresh line.** `refresh=wait_for` is parsed but nothing in `topk-es/src` consumes it. Cut from page 4 (engineer, DevRel, PM).
7. **SQL ORDER BY.** Docs say single key; `topk-sql/src/stmt/select.rs` lines 246-266 accept multiple. Resolve.
8. **Vespa** does filter-before-rank, single-plan hybrid, and multi-vector. It must be a benchmark baseline (ML researcher).

## Blocker before the tagline ships

The filter guarantee (`docs/concepts.mdx` line 20) has no public benchmark. All five flag it.

Benchmark spec (engineer + ML researcher):
- Data: big-ann 2023 Filter track (YFCC-10M) plus Cohere-Wikipedia-10M with Zipf `tenant_id` and `date`. BEIR NQ/HotpotQA with assigned metadata for quality.
- Baselines: pgvector 0.8 (iterative scan on/off), Qdrant, Weaviate, ES 9 knn+filter, Milvus, Vespa, brute-force exact.
- Selectivity: 100 / 10 / 1 / 0.1 / 0.01 percent, exactly-k, zero. Predicate mix: equality, range, regex, keyword.
- Metrics: Recall@10 and @100 vs exact filtered truth, percent of queries returning fewer than k, p50/p99 at the tuned point where each system reaches 0.95, QPS, $/1M queries, storage $/month. TopK cold and warm.
- Credible result: recall flat at or above 0.95, zero under-k, p99 rising 2 to 3x at 0.01 percent. Suspicious: flat latency and recall and lowest cost everywhere, or competitors at default `ef_search`.
- Publish harness and raw CSVs in `topk-io/bench`.

## Do not say

Drop-in Postgres replacement. Elasticsearch compatible. 10x cheaper as a headline. Any latency number without cold-cache data. Built-in agent memory or MCP-ready. Embeds your images. Transactional bulk load. Beats Turbopuffer on cost.

## 90-day plan (merged)

| Week | Deliverable | Owner |
|---|---|---|
| 1-2 | Fix corrections 1-7 above in the five Tier-1 pages. Add JS and SQL tabs. Add `answers` nav to `docs/docs.json`. Fix broken `/datasets` and `/mcp-server` links in `docs/changelog.mdx`. | DevRel |
| 1-3 | Filtered-recall test in `topk-rs/tests`: 50k vectors, filters to k, k+1, 1, 0 matches, assert count and recall vs brute force. | Eng |
| 2-6 | Filtered-recall benchmark per spec. Replace `docs/limits.mdx` "95%+" with a link. | Eng + ML |
| 3-5 | Read-your-writes page and 60-second video. Verifiable with an API key. | DevRel |
| 4-8 | Expose `matched_count`, `query_stream`, `saturate`, `decay` in Python, JS, SQL. | Eng |
| 5-8 | Multi-tenant hybrid search guide and sample repo (FastAPI + Next.js, partition per org). | DevRel |
| 6-10 | LangChain and LlamaIndex vector store packages. | Eng |
| 8-12 | Homepage: three problems above the fold, each linking to an answer page. Publish the benchmark. Ship the tagline. | Marketing |

## Success in 90 days

- Five answer pages rank for "pgvector filter fewer results", "chroma bm25 hybrid", "qdrant multi-tenancy".
- Benchmark published and linked from homepage.
- Share of new collections using filter plus scoring function, and share using partitions, both up.
- LangChain/LlamaIndex packages at 100+ monthly installs.
- Zero support tickets asking "did my filter apply".

## Second and third messages (Q2)

- ColPali archives at object-storage cost. Needs real ColPali snippet, 1-bit recall number, doc-cap fix, cold p99.
- Agent memory that favors recent and stays private. Needs `decay`/`saturate` exposed, mem0 provider.

## Research content (ML researcher)

1. Open filtered-retrieval benchmark harness extending big-ann's filter track to arbitrary predicates.
2. SMVE technical report with recall-vs-latency vs PLAID and MUVERA; Iso-ModernColBERT BEIR/ViDoRe numbers on the model card.
3. "Score normalization beats fusion": reproduce Bruch et al. 2023 with in-engine `saturate()`.

# TopK: recurring real-user problems it can solve

Date: 2026-09-10. Sources: GitHub issue trackers (fetched), local repo `davidmyriel/topk`. HN / Stack Overflow / vendor forums were blocked by the proxy; counts from those are unverified and marked ~.

## A. Ranked by popularity (cross-ecosystem)

| # | Problem | Strongest evidence | TopK feature | Gap / risk |
|---|---|---|---|---|
| 1 | Filtered vector search: recall collapse, fewer-than-k, index bypass | pgvector #259 (87 comments, 61 reactions, top issue in repo); pgvector #678, #719, #721, #980; Milvus ~47 "less than topk" issues; ES #106994 (35 reactions); Weaviate #2393 (36) | Filters applied inside the engine before top-k, recall guarantee documented | Doc needed: no guide compares to post-filtering |
| 2 | Hybrid BM25 + vector missing, bolted on, or paywalled | Chroma #1330 (78 reactions, open since 2023, top issue); Weaviate #4019 (23); open-webui #20737, #20469 (BM25 rebuilt in Python per query, 30–60 s); ES RRF requires Platinum license (discuss 342354, langchain-elastic #38) | Single-query hybrid scoring, RRF in ES API for free | ES-compat layer undocumented |
| 3 | RAM is the cost ceiling: OOM, "DB cannot exceed RAM" | Milvus 135 OOM-titled issues (#40270: 329 GB for 200M vectors); Chroma #1323 (open since 2023); LanceDB #767 (25 comments); Qdrant ~101 memory issues; OpenSearch k-NN #2401 (33 comments); Elastic shipped DiskBBQ citing this | Object-storage-native, NVMe/RAM cache | Cold-cache latency not benchmarked publicly |
| 4 | Multi-tenancy: collection/shard/namespace caps | Weaviate #2970 (19), #3500 (27), #2565 (25); Qdrant #5032 (5,000 per-user collections OOM), #1322 wontfix; Milvus 65,536 collection cap, discussion #3287 (2020–2026); ES `max_shards_per_node` (#20705) | Partitions, implicit creation, O(1) atomic drop, 1B docs each | Partitions unreachable via ES API; only Python docs mention partition APIs |
| 5 | Multi-vector / ColBERT / ColPali storage | ES #72068 (open since 2021, 50 reactions, 30 comments); Milvus #31581 (37 comments); Weaviate #2465 (96), #4278; pgvector #694, #970 closed no-support; Qdrant #9408 size cap | Native MaxSim, 1-bit/2-bit quantization, matrix via ES `knn` | Managed inference is text-only; image embeddings BYO |
| 6 | HNSW build/reindex time and memory | Weaviate #2359 Reindex API (open since 2022, 70 reactions); pgvector #409 (26 comments), #500 (30), #822 (stuck 19 h at 29%); Supabase #35040 | Managed indexing, no maintenance_work_mem | No transactions; bulk load not atomic |
| 7 | Postgres users: no BM25, LIKE '%x%' slow, ES-sync pain | Supabase discussion #18061 pg_bm25 (59 upvotes); ParadeDB ~9.3k stars; ZomboDB ~4.7k, pgsync ~1.4k; pg_trgm 58 GB index / 42 s queries (pgsql-general) | Postgres wire endpoint: `bm25_score`, ngram + regex/LIKE, GROUP BY/HAVING | No JOIN, no `SELECT *`, no transactions, no RLS. Breaks Metabase/dbt/ORM introspection |
| 8 | Read-your-writes after upsert | pinecone-ts-client #226 (wontfix); Milvus 29 consistency issues (#16949 etc.); Qdrant #6556, #7889; ES refresh-lag threads yearly | LSN read-your-writes; `SET consistency_level='strong'` in SQL; `refresh=wait_for` in ES | SQL cannot pass explicit LSN |
| 9 | Coding-agent memory and codebase indexing | claude-code ~10 duplicate memory requests (#34556, #14227 …); Continue #2917 (50 GB sqlite), #4309 (30 GB), ~12 threads; Cursor forum ≥8 indexing-stuck threads; Cody dropped embeddings | Server-side embeddings, BM25 + ngram + regex for code, partitions per repo/user, time decay | No MCP server (removed Aug 27), no Continue/Cursor provider |
| 10 | Agent memory isolation + recency ranking | mem0 #3998; openclaw #38417; hermes-agent #34352; open-webui #23655; mem0 shipped "Memory Decay" | Partitions, timestamps, `elapsed`/`decay`/`saturate` | `decay`/`saturate` Rust-only, undocumented; no mem0/LangChain/LlamaIndex integration shipped (topk-io forks exist) |
| 11 | Elasticsearch cost for logs/archives | HN ClickHouse/Quickwit/Loki migration threads; Elastic logsdb mode; searchable snapshots Enterprise-only (#78573) | ES `_bulk`/`_search`, ngram/regex, object storage | No Kibana, ILM, data streams, `date_histogram`, `cardinality`, `search_after`; 70 MB/s per partition |
| 12 | Aggregations / facets / exact counts | Milvus #19152 (open since 2022); Qdrant #10125 (`count` under-counts 20–60%, open), #7274 (4.2 s exact count on 260M); Chroma #469 (18) | `group_by`, count/sum/avg/min/max/quantile/count_distinct; `matched_count()` | quantile/count_distinct/matched_count Rust-only, undocumented |
| 13 | Deep pagination caps | ES 10k `max_result_window` threads yearly; Milvus #22718 (16,384 cap); Qdrant #496 | `offset` stage; SQL OFFSET | ES layer caps from+size at 10k too; no `search_after` |
| 14 | Typesense/Meilisearch/Algolia: RAM-bound or per-search pricing | typesense #120, #2312; meilisearch #3744 (38x index bloat), #5958; HN Algolia pricing threads | Object storage, ngram, hybrid | No InstantSearch/Typesense-compatible API |

## B. Highest-leverage unaddressed situations

1. **Filtered hybrid search for multi-tenant SaaS** (problems 1+2+4). Largest cross-repo demand. Zero application-level guide today.
2. **ColPali / visual document retrieval at archive scale** (5+3). Incumbents lack indexed MaxSim; TopK has it plus cheap storage. Guide exists for the primitive, not the use case.
3. **pgvector graduation path** (6+7+1). Postgres wire endpoint lets psycopg2/node-postgres users move the search table only. Needs a migration guide stating no-JOIN/no-transaction limits.
4. **Elasticsearch cold/app-search tier** (11+2+8). ES-compat crate is shipped but unpublished and undocumented. Needs `X-Elastic-Product` header (present), RRF (present), pagination and date aggs (absent).
5. **Coding-agent and agent memory store** (9+10). Repeated demand across claude-code, Continue, Cursor, mem0. TopK removed its MCP server; an engine-level MCP or mem0 provider would re-enter this.
6. **Search analytics over embeddings in Grafana** (12). Raw-SQL panels work today; needs quantile/count_distinct exposed in SQL and Python/JS.

## C. Blockers to fix before targeting these

- Publish and document `topk-es` (currently `publish = false`, no README).
- Expose `quantile`, `count_distinct`, `saturate`, `decay`, `matched_count`, `query_stream` in Python/JS/SQL.
- Add `search_after`, `date_histogram`, `cardinality`, `wildcard`, `query_string` to ES layer.
- Ship LangChain/LlamaIndex/mem0 integrations (only Haystack exists).
- Guides: multi-tenant hybrid search, ColPali archive, pgvector migration, agent memory, recency ranking.
- Fix broken changelog links to removed `/datasets/*` and `/mcp-server` pages.

## D. Evidence caveats

GitHub API rate-limited unauthenticated after ~15 calls; issue pages render without comment/reaction counts. Counts above come from GitHub search API sorted by reactions/comments where available. HN, Stack Overflow, discuss.elastic.co, Reddit, Pinecone forum, vendor sites: blocked. Claims from those are URL-cited only.

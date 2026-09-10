# topk.io site audit

Date: 2026-09-10. Method: topk.io, www.topk.io, docs.topk.io, LinkedIn, and web.archive.org are blocked by this session's egress proxy. Page content below was reconstructed from search-engine snippets of each URL plus the repo's `docs/` source (which is the docs.topk.io source). Verbatim quotes are from snippets. Anything not quoted is inferred and marked.

## 1. Page inventory

| URL | Title tag | What the snippet says the page says |
|---|---|---|
| `/` | TopK - Search engine for accuracy-critical AI applications | "hybrid search, multi-vector retrieval, custom ranking, and managed inference in one API." "built on object storage for 10x lower cost and unlimited scale." "Sub-100ms latency at billion scale." SDKs, Postgres wire protocol. |
| `/pricing` | Pricing - TopK \| Search engine for the AI era | "pay-as-you-go", "no upfront commitment", free tier. No unit prices surfaced in snippets. |
| `/benchmarks` | TopK - Search engine for the AI era | "$29/month for a 10M-item, 10M writes, 50M queries workload vs $120–650 for other providers." Competitors anonymized. |
| `/use-cases/recsys` | Retrieval for Recommendation Systems | "one serving layer for fresh writes, product-aware filters, and dense, sparse, keyword, and multi-vector retrieval." "if the right items never reach the pool, no ranking model can recover them." Only use-case page found. |
| `/faq` | FAQ | "managed search engine for AI applications." Compares to vector DBs. Says SDKs include "a CLI, and an MCP Server". |
| `/learn/top-k` | Top-k (Retrieval) | Glossary. |
| `/learn/multi-tenant-vector-search` | Collections or Filters for Multi-Tenancy? | Problem-shaped. Recommends shared collection + tenant filter, split out huge tenants. |
| `/learn/shard-rebalancing` | Why Do Vector Databases Re-Shard? | Problem-shaped. Stateful architectures must move vectors between nodes. |
| `/learn/maxsim` | What Is MaxSim? | Concept. Mentions SMVE. |
| `/blog` | Blog | Posts below. |
| `/blog/seed-round` | We Raised $5.5 Million to build an AI-Native Search Engine for Enterprises | Earlybird, KAYA, Irregular Expressions. "world's first AI-native, true hybrid search engine for enterprise." |
| `/blog/vector-dbs-are-the-wrong-abstraction...` | Why Vector DBs Are the Wrong Abstraction | Thesis post. Filters degrade vector DBs; coupling compute and storage causes over-provisioning. Also mirrored at `/resources/engineering-journal/...`. |
| `/blog/20250724-beyond-rff...` | Beyond RRF: How TopK Improves Hybrid Search by up to 7.8% | BEIR, nDCG@10 +4.5% avg, +7.8% max vs RRF. |
| `/blog/20251201-topk-bench` | TopK Bench | Ingest, concurrency, filtering, recall, read-write at 100k/1M/10M. Competitors anonymized. |
| `/blog/20260311-smve...` | SMVE: Multi-Vector Retrieval That Just Works | 5–8x lower latency than PLAID and MUVERA. |
| `/blog/20260628-rag-is-broken-for-agents` | RAG Is Broken for Agents. Here's How We Fixed It. | "constraint on agent quality has shifted... to can it find the evidence." Late interaction: accuracy 2.3x to ~42%, cost 10x lower to $0.47/query. |
| `/blog/binary-vector-search-arm-neon` | Binary Vector Search at 350GB/s | Engineering post. |
| `/team` | Team | Marek Galovič CEO, Jerguš Lejko CTO. |
| `/security` | Responsible Disclosure | SOC 2 Type I, VPC, on-prem. |
| `docs.topk.io` | Introduction | "hybrid retrieval engine built on object storage for 10x lower cost and massive scale." Snippets still mention datasets, "answers with citations", MCP. |
| GitHub org | | Tagline "Pushing state of the art, one flamegraph at a time." Repo: "High-quality search for AI-native applications." 95 stars. |

## 2. Findings

### 2.1 Six taglines, no single promise

| Surface | Line |
|---|---|
| Homepage title | Search engine for accuracy-critical AI applications |
| Pricing, benchmarks title | Search engine for the AI era |
| Docs, README | Hybrid retrieval engine built on object storage for 10x lower cost and massive scale |
| FAQ | Managed search engine for AI applications |
| Seed post | AI-native, true hybrid search engine for enterprise |
| GitHub | High-quality search for AI-native applications |

None of these names a pain. "Accuracy-critical" is the closest and is the strongest of the six.

### 2.2 The site sells the engine, not the outcome

Homepage copy is a feature list: hybrid, multi-vector, custom ranking, managed inference, object storage, sub-100ms, SDKs, SQL. A reader with pgvector returning 3 of 10 results does not see their problem on the page.

### 2.3 Stale content contradicts the product

File Search, datasets, "answers with citations", CLI upload/search/ask, and the MCP server were removed on 2026-08-27 (PRs #574, #576, #578). Search snippets for `/faq` and `docs.topk.io` still advertise them. `docs/changelog.mdx` links to four removed pages. A prospect who reads "connect via MCP" and then cannot will not come back.

### 2.4 The Learn section already has the right shape

"Collections or Filters for Multi-Tenancy?", "Why Do Vector Databases Re-Shard?", "RAG Is Broken for Agents." These are questions people type. They are buried under `/learn` and `/blog`. The homepage does not link to a single one.

### 2.5 One use case page, and it is the least-searched one

`/use-cases/recsys` is well written ("if the right items never reach the pool, no ranking model can recover them") but recommendation systems did not appear in any of the top-12 pain clusters. Multi-tenant SaaS search, RAG for agents, and pgvector graduation did, and none has a page.

### 2.6 Proof exists but is hidden or hedged

- Benchmarks anonymize competitors. Engineers discount anonymized comparisons.
- "$29 vs $120–650" is on the benchmarks page, not the homepage.
- "+7.8% nDCG over RRF" and "5–8x faster than PLAID/MUVERA" are in blog posts, not next to the claims they support.
- "Sub-100ms at billion scale" has no linked benchmark.
- The filter-before-top-k guarantee, the single most differentiated claim, appears only in `docs/concepts.mdx`.

### 2.7 No customers, no logos, no quotes

Nothing on the site names a user. The seed post names investors only.

### 2.8 Pricing is opaque in search

Snippets surface "pay-as-you-go" and "free tier" but no unit price. Competitors (Turbopuffer, Pinecone) rank for "vector database pricing" with numbers.

### 2.9 Navigation buries the decision path

Observed sections: Home, Pricing, Benchmarks, Use cases (1), Learn, Blog, FAQ, Team, Security, Docs. There is no "Compare", no "Migrate from", no "Problems we solve".

## 3. What is working

- The Learn titles and the "RAG is broken" post. Keep the voice.
- "Why Vector DBs Are the Wrong Abstraction" is the thesis. It is correct and should be the spine of the homepage.
- The benchmark suite is open source (`topk-io/bench`). Credibility asset.
- SOC 2, VPC, on-prem. Enterprise blockers already answered.
- Postgres wire protocol. Unique among vector engines.

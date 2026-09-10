# TopK rebrand: from engine features to user pains

Date: 2026-09-10. Builds on `01-site-audit.md`, `content/answers/00-research-report.md` (GitHub-issue evidence), and `content/answers/01-focused-message.md` (five-persona synthesis).

## 1. Brand promise

**Search that returns what you asked for.**

Every pain in the research is a version of "I asked for X and got something else": fewer than k results, keyword or vector but not both, one tenant's data leaking into another, a document I just wrote, a bill for data nobody queries, a page image the database cannot represent.

Category: **retrieval engine**. Not "vector database" (Pinecone owns it, and the thesis post says it is the wrong abstraction). Not "search engine for the AI era" (says nothing).

## 2. Tagline system

| Use | Line |
|---|---|
| Primary (title tag, hero) | TopK. Search that returns what you asked for. |
| Support line (hero sub) | Filters, keywords, vectors, and tenants in one query, on object storage. |
| Developer one-liner (README, GitHub, PyPI) | Filter first, rank second. Ask for 10, get 10. |
| Enterprise (sales deck, seed-style press) | The retrieval engine for accuracy-critical AI products. |

Retire: "Search engine for the AI era", "AI-native search", "10x lower cost" as a headline (keep as a proof point with the $29 figure).

## 3. Messaging pillars

Each pillar is a pain, a one-line answer, a proof, and the page it links to.

| # | Pain (in the user's words) | Answer | Proof today | Proof needed |
|---|---|---|---|---|
| 1 | "I filtered and got 3 results instead of 10." | Filters run before ranking. Every match is eligible. | `docs/concepts.mdx` guarantee; pgvector #259 (87 comments) as the named failure | Filtered-recall benchmark at 0.01–100% selectivity, named competitors |
| 2 | "Keyword and vector search, and I have to merge them myself." | One index, one scoring formula, no fusion step. | "Beyond RRF" post: +4.5% avg, +7.8% max nDCG@10 on BEIR | Move the number to the homepage |
| 3 | "5,000 customers, and my vector DB choked on 5,000 collections." | A partition per tenant, a billion docs each, nothing in RAM when idle. | Learn article on multi-tenancy; Qdrant #5032, Weaviate #2970 | 10k-partition benchmark, idle-tenant cost |
| 4 | "The bill scales with data nobody searches." | Object storage is the only durable store. | Benchmarks page: $29 vs $120–650 at 10M items | Cold-cache p99 published |
| 5 | "My agent wrote a memory and couldn't read it back." | Every write returns an LSN. Hand it to the next query. | `docs/collections/query.mdx`; pinecone-ts-client #226 wontfix | 60-second demo video |
| 6 | "Scanned PDFs don't OCR. ColPali needs 1,000 vectors per page." | Multi-vector MaxSim with 1-bit quantization. | SMVE post: 5–8x faster than PLAID and MUVERA; "RAG is broken" post: 2.3x accuracy, 10x cheaper | ViDoRe numbers; fix the 200 KB doc cap conflict with f16 ColPali |
| 7 | "Postgres ranking is bad and LIKE '%x%' crawls." | Postgres wire protocol with BM25, ngram, and vectors. | SQL reference | Migration guide with limits (no JOIN, no transactions) |

Pillars 1–3 are the homepage. 4–7 are second-scroll and dedicated pages.

## 4. Site architecture

Nav (before): Home, Pricing, Benchmarks, Use cases, Learn, Blog, FAQ, Team, Security, Docs.

Nav (after): **Problems** · **Compare** · **Pricing** · **Docs** · Blog · Company

- **Problems** replaces Use cases. One page per pillar, question-titled, in the Learn voice. The twelve drafts in `content/answers/` seed it.
- **Compare** is new. One page each: vs pgvector, vs Pinecone, vs Qdrant, vs Elasticsearch, vs Turbopuffer. Each page is the differentiation matrix row for that competitor, with named benchmarks and an honest "when to stay" section.
- **Pricing** shows unit prices above the fold and the $29 worked example.
- **Learn** merges into Problems and Docs. Keep URLs, redirect.
- **Benchmarks** merges into Compare. Name the competitors or lose the credibility.
- **Company** holds Team, Security, seed post.

## 5. Homepage, section by section

**Hero**
Title: Search that returns what you asked for.
Sub: Filters, keywords, vectors, and tenants in one query. Built on object storage, so you pay for what you search.
CTA: Start free · Read the benchmark
Right side: one query, 12 lines, showing filter + bm25 + semantic + partition + limit 10.

**Three problems (cards, question-titled)**
1. Why does my filtered vector search return fewer results than I asked for?
2. How do I combine keyword and vector search in one query?
3. How do I keep each customer's data separate without thousands of collections?
Each card: two-sentence answer, link to the Problems page.

**Proof strip**
$29 vs $120–650 at 10M items · +7.8% nDCG over RRF · 5–8x faster multi-vector than PLAID · SOC 2 Type I
Each links to its source.

**How it works (one diagram)**
Object storage → NVMe/RAM cache → `reactor` query engine → one plan: filter, score, rank, aggregate. Three sentences from the architecture page.

**Second-row problems**
Read-your-writes · ColPali archives · Postgres wire protocol · Agent memory
One line each.

**Compare strip**
"Coming from pgvector / Pinecone / Qdrant / Elasticsearch?" Four links.

**Footer**
Docs, SDKs (Python, JS, Rust, SQL), status, security, GitHub.

## 6. Page-level copy rules

- Every page title is a question or a pain, never a feature name. "Multi-vector search" becomes "How do I search scanned documents?"
- First sentence answers. Second names the competitor failure with an issue link. Then code.
- Every number links to its benchmark or post.
- Every page has a "What does not work" section. The Postgres and Elasticsearch pages need it most.
- No word "AI-native". No "10x" without the dollar figure next to it.

## 7. Immediate fixes (before any redesign)

1. Remove MCP, datasets, CLI upload/search/ask, and "answers with citations" from `/faq`, `docs.topk.io` intro, and `docs/changelog.mdx`. They were deleted on 2026-08-27 and the site still sells them.
2. Set one title tag across `/`, `/pricing`, `/benchmarks`.
3. Move the $29 comparison and the +7.8% figure to the homepage.
4. Link the three Learn articles from the homepage.
5. Update GitHub org and repo descriptions to the developer one-liner.
6. Update PyPI `topk-sdk` description, which still says "File/document search".

## 8. What must ship before the tagline goes live

- Filtered-recall benchmark with named competitors (all five personas flagged this as the blocker).
- Fix or caveat the ColPali doc-cap conflict (264 KB per page in f16 vs 200 KB limit).
- Expose `saturate` and `decay` outside Rust so hybrid examples normalize scores.
- Decide on `topk-es` (publish or keep silent). Do not mention Elasticsearch compatibility until decided.

## 9. Risks

- "Returns what you asked for" invites a recall test. Dense ANN is 95%, not 100%. The claim is that filters and tenants are honored and recall does not degrade under selectivity. Say that on the Problems page.
- Naming competitors in benchmarks invites rebuttal. Publish the harness and raw data; that is already open source.
- Postgres wire protocol invites "drop-in replacement" reading. The Compare vs pgvector page must lead with the limits.

## 10. Sequence

| Week | Work |
|---|---|
| 1 | Immediate fixes (section 7). One title tag. Stale content removed. |
| 2–3 | Problems section live with the five Tier-1 pages. Homepage hero and three cards. |
| 3–6 | Filtered-recall benchmark. Compare pages for pgvector and Pinecone. |
| 6–8 | Pricing page with unit prices. Compare vs Qdrant, Elasticsearch, Turbopuffer. |
| 8–10 | Second-row problem pages. Redirect Learn and Use cases. |
| 10–12 | Tagline live everywhere: site, docs, GitHub, PyPI, LinkedIn. |

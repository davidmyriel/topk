# Integration targets: how we choose them and keep them honest

Third-party integrations get TopK into other projects' docs, where developers and coding agents find it. Each one costs engineering time, so a project goes through four gates before we build anything.

| # | Gate | Question | How it's decided |
|---|---|---|---|
| 1 | **Fit** | Does the integration fit TopK? | A recorded judgment (`fit` in `integration-candidates.json`), plus proof that the project already integrates peer vector stores |
| 2 | **Popularity** | Is the project popular, with recent and growing activity? | Stars, archived state, last push, commits in 90 days, latest release, merged PRs in the last 90 days compared with the 90 before, and PyPI or npm downloads |
| 3 | **Merge** | Can we get the PR merged? | Contribution-policy text (blocking, welcoming or extra-step phrases), merged PRs similar to ours in the last year, and the share of outside contributors' PRs that get merged, with median time to merge |
| 4 | **Docs** | Can we easily change their docs? | A public docs source we can PR, a peer page to copy as a template, and recent commits to that docs directory |

Each gate comes out ✅ pass, ⚠️ weak, ❌ fail or ❔ unknown. The overall verdict is:

- **GO**: every gate passes. Build it.
- **INVESTIGATE**: no gate fails, but at least one is weak or unknown. Open an issue in their repo asking whether they'd accept a TopK integration before writing code.
- **NO-GO**: a gate fails. Change the plan (for example, publish a standalone package instead of a PR) or skip the target.

## Judging fit

Score fit 0 to 3 and say which TopK strengths the integration exposes:

- `server-side-embedding`: `semantic_index()` embeds documents and queries, so users don't run an embedding model.
- `multi-vector`: topk-embed-v1 and MaxSim, for long chunks, tables and identifiers.
- `hybrid-bm25`: semantic, keyword, filters and ranking in one query.
- `images`: `image()` fields for page renders and figures.
- `object-storage-cost`: large corpora at low cost.
- `multi-tenancy`: partitions.

A 3 means the project's users process complex documents and the integration can show off at least two strengths that a generic vector-store adapter can't. A 2 means a good fit through a standard vector-store interface. Anything below 2 isn't worth building yet.

## Running the evaluation

```bash
GITHUB_TOKEN=$(gh auth token) bun run utils/evaluate-integration-candidates.ts --report candidates.md
```

`--only <name>` evaluates a single candidate. Without `GITHUB_TOKEN`, the GitHub metrics come back unknown instead of being guessed. The **Evaluate integration candidates** workflow runs the evaluation monthly and on demand, and writes the scorecard to the job summary.

To add a candidate, add an entry to `utils/integration-candidates.json`:

- `peers`: paths in their repo to an existing integration like ours (for example, their Turbopuffer adapter). This proves the integration surface exists.
- `precedent_search`: words to search for in their merged PRs.
- `policy`: URLs of their contribution rules (raw `CONTRIBUTING.md`, or a docs page).
- `docs.repo`, `docs.path` and `docs.peer_page`: where their docs live and which page to copy.

## After it ships

Once the integration is merged and its docs page is live:

1. Add a page under `docs/integrations/` that links to their listing.
2. Move the project from `integration-candidates.json` to `integrations.json`, with checks for the listing page, the package and the repo.
3. `utils/check-integrations.ts` then runs weekly and opens an issue if the listing disappears, the package is pulled or the repo is archived.

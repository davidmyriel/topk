// usage: bun run utils/evaluate-integration-candidates.ts [--only <name>] [--report <file.md>]
//
// Scores each project in utils/integration-candidates.json against the four
// gates in utils/INTEGRATIONS.md:
//
//   1. Fit         does the integration fit TopK? (recorded judgment, plus peers found in their code)
//   2. Popularity  is the project popular, with recent and growing activity?
//   3. Merge       can we get the PR merged? (policy text, precedent PRs, outside-contributor merge rate)
//   4. Docs        can we easily change their docs? (public docs source, a peer page to copy, active docs)
//
// GitHub API metrics need GITHUB_TOKEN (any token can read public repos).
// Without one, those metrics are reported as unknown rather than guessed.

import { Command } from "commander";
import path from "path";

const ROOT = path.resolve(import.meta.dir, "..");
const CANDIDATES = path.join(ROOT, "utils/integration-candidates.json");
const USER_AGENT = "topk-integration-candidates (+https://github.com/topk-io/topk)";
const DAY = 86_400_000;

type Thresholds = {
  min_stars: number;
  max_days_since_push: number;
  min_commits_90d: number;
  min_release_days: number;
  min_merged_pr_trend: number;
  min_external_merge_rate: number;
  min_docs_commits_90d: number;
};
type Phrases = { blocking: string[]; welcoming: string[]; friction: string[] };
type Candidate = {
  name: string;
  repo: string;
  pypi?: string;
  npm?: string;
  fit: { score: number; category: string; strengths: string[]; rationale: string };
  peers: string[];
  precedent_search?: string;
  policy: string[];
  policy_note?: string;
  docs: { repo: string | null; path: string | null; peer_page: string | null };
};
type Config = { thresholds: Thresholds; policy_phrases: Phrases; candidates: Candidate[] };

type Verdict = "pass" | "weak" | "fail" | "unknown";
type Gate = { name: string; verdict: Verdict; evidence: string[] };

// ---------- HTTP ----------

async function request(url: string, headers: Record<string, string> = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": USER_AGENT, ...headers },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status >= 500 && attempt < 2) {
        await Bun.sleep(2000 * (attempt + 1));
        continue;
      }
      return res;
    } catch (e) {
      if (attempt === 2) return null;
      await Bun.sleep(2000 * (attempt + 1));
    }
  }
  return null;
}

let githubAvailable = true;

// Returns parsed JSON and the response, or null when the API can't answer (no token, rate limit, blocked)
async function github(pathAndQuery: string): Promise<{ json: any; res: Response } | null> {
  if (!githubAvailable) return null;
  const token = process.env.GITHUB_TOKEN;
  const res = await request(`https://api.github.com${pathAndQuery}`, {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  });
  if (!res) return null;
  if (res.status === 403 || res.status === 429 || res.status === 401) {
    // Rate limited or not allowed: stop calling for the rest of the run
    githubAvailable = false;
    return null;
  }
  if (!res.ok) return null;
  return { json: await res.json(), res };
}

// Count list items with per_page=1 by reading the last page number from the Link header
async function githubCount(pathAndQuery: string): Promise<number | null> {
  const sep = pathAndQuery.includes("?") ? "&" : "?";
  const r = await github(`${pathAndQuery}${sep}per_page=1`);
  if (!r) return null;
  const last = r.res.headers.get("link")?.match(/[?&]page=(\d+)>; rel="last"/);
  if (last) return Number(last[1]);
  return Array.isArray(r.json) ? r.json.length : null;
}

async function searchCount(q: string): Promise<{ count: number; latest?: string } | null> {
  const r = await github(`/search/issues?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=1`);
  if (!r) return null;
  const item = r.json.items?.[0];
  return { count: r.json.total_count, latest: item ? `${item.title} (${item.html_url})` : undefined };
}

async function rawExists(repo: string, file: string): Promise<boolean> {
  const res = await request(`https://raw.githubusercontent.com/${repo}/HEAD/${file}`);
  return res?.status === 200;
}

async function fetchText(url: string): Promise<string | null> {
  const res = await request(url);
  if (!res || res.status !== 200) return null;
  return (await res.text()).toLowerCase();
}

const isoDaysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
const daysSince = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / DAY);
const fmt = (n: number) => n.toLocaleString("en-US");

// ---------- Gates ----------

async function gateFit(c: Candidate): Promise<Gate> {
  const evidence: string[] = [];
  let verdict: Verdict;
  if (!c.fit?.rationale || !c.fit.score) {
    verdict = "fail";
    evidence.push("No fit rationale recorded. Say which TopK strengths this integration exposes.");
  } else {
    verdict = c.fit.score >= 2 ? "pass" : "weak";
    evidence.push(`Fit score ${c.fit.score}/3 (${c.fit.category}): ${c.fit.rationale}`);
    evidence.push(`TopK strengths it would expose: ${c.fit.strengths.join(", ")}`);
  }
  if (c.peers.length) {
    const found = await Promise.all(c.peers.map((p) => rawExists(c.repo, p)));
    const hits = c.peers.filter((_, i) => found[i]);
    evidence.push(
      hits.length
        ? `Already integrates peers: ${hits.map((p) => `\`${p}\``).join(", ")}`
        : `None of the expected peer integrations were found (${c.peers.join(", ")}); the integration surface may have moved`
    );
    if (!hits.length && verdict === "pass") verdict = "weak";
  }
  return { name: "Fit", verdict, evidence };
}

async function gatePopularity(c: Candidate, t: Thresholds): Promise<Gate> {
  const evidence: string[] = [];
  const misses: string[] = [];
  let hardFail = false;

  const repo = await github(`/repos/${c.repo}`);
  if (repo) {
    const r = repo.json;
    evidence.push(`${fmt(r.stargazers_count)} stars, ${fmt(r.forks_count)} forks`);
    if (r.archived) {
      hardFail = true;
      evidence.push("Repository is archived");
    }
    if (r.stargazers_count < t.min_stars) {
      hardFail = true;
      evidence.push(`Below the ${fmt(t.min_stars)}-star bar`);
    }
    const pushed = daysSince(r.pushed_at);
    evidence.push(`Last push ${pushed} days ago`);
    if (pushed > t.max_days_since_push) misses.push("no recent pushes");
  }

  const commits = await githubCount(`/repos/${c.repo}/commits?since=${isoDaysAgo(90)}T00:00:00Z`);
  if (commits !== null) {
    evidence.push(`${fmt(commits)} commits on the default branch in the last 90 days`);
    if (commits < t.min_commits_90d) misses.push("few commits");
  }

  const release = await github(`/repos/${c.repo}/releases?per_page=1`);
  if (release) {
    const latest = release.json[0];
    if (latest) {
      const age = daysSince(latest.published_at ?? latest.created_at);
      evidence.push(`Latest release ${latest.tag_name}, ${age} days ago`);
      if (age > t.min_release_days) misses.push("no recent release");
    } else {
      evidence.push("No GitHub releases");
    }
  }

  // Growth: merged PRs in the last 90 days compared with the 90 days before that
  const recent = await searchCount(`repo:${c.repo} is:pr is:merged merged:${isoDaysAgo(90)}..${isoDaysAgo(0)}`);
  const prior = await searchCount(`repo:${c.repo} is:pr is:merged merged:${isoDaysAgo(180)}..${isoDaysAgo(91)}`);
  if (recent && prior) {
    const trend = prior.count ? recent.count / prior.count : recent.count ? Infinity : 0;
    const label = !prior.count && !recent.count ? "no activity" : Number.isFinite(trend) ? `${trend.toFixed(2)}x` : "new activity";
    evidence.push(`Merged PRs: ${fmt(recent.count)} in the last 90 days vs ${fmt(prior.count)} in the 90 before (${label})`);
    if (!recent.count && !prior.count) misses.push("no merged PRs in six months");
    else if (trend < t.min_merged_pr_trend) misses.push("activity is shrinking");
  }

  if (c.pypi) {
    const res = await request(`https://pypistats.org/api/packages/${c.pypi}/recent`);
    if (res?.ok) evidence.push(`PyPI \`${c.pypi}\`: ${fmt((await res.json()).data.last_month)} downloads last month`);
  }
  if (c.npm) {
    const res = await request(`https://api.npmjs.org/downloads/point/last-month/${c.npm}`);
    if (res?.ok) evidence.push(`npm \`${c.npm}\`: ${fmt((await res.json()).downloads)} downloads last month`);
  }

  if (!repo) {
    evidence.unshift("GitHub API unavailable: set GITHUB_TOKEN to measure stars and activity");
    return { name: "Popularity", verdict: "unknown", evidence };
  }
  if (misses.length) evidence.push(`Misses: ${misses.join(", ")}`);
  return { name: "Popularity", verdict: hardFail ? "fail" : misses.length ? "weak" : "pass", evidence };
}

async function gateMerge(c: Candidate, t: Thresholds, phrases: Phrases): Promise<Gate> {
  const evidence: string[] = [];
  let blocked = false;
  let friction = false;
  let positive = 0;

  for (const url of c.policy) {
    const text = await fetchText(url);
    if (text === null) {
      evidence.push(`Could not read policy ${url}`);
      continue;
    }
    const hit = (list: string[]) => list.filter((p) => text.includes(p.toLowerCase()));
    const b = hit(phrases.blocking);
    const w = hit(phrases.welcoming);
    const f = hit(phrases.friction);
    if (b.length) {
      blocked = true;
      evidence.push(`Policy ${url} says: ${b.map((p) => `"${p}"`).join(", ")}`);
    }
    // A welcoming phrase doesn't count when the same policy blocks new integrations
    if (w.length && !b.length) {
      positive++;
      evidence.push(`Policy welcomes it: ${w.map((p) => `"${p}"`).join(", ")}`);
    }
    if (f.length) {
      friction = true;
      evidence.push(`Extra steps: ${f.map((p) => `"${p}"`).join(", ")}`);
    }
    if (!b.length && !w.length && !f.length) evidence.push(`Policy ${url} says nothing about new integrations`);
  }
  if (!c.policy.length) evidence.push("No contribution policy found; open an issue asking before writing code");
  if (blocked && c.policy_note) evidence.push(`Expected: ${c.policy_note}`);

  if (c.precedent_search) {
    const p = await searchCount(`repo:${c.repo} is:pr is:merged ${c.precedent_search} merged:>${isoDaysAgo(365)}`);
    if (p) {
      evidence.push(`${fmt(p.count)} merged PRs mentioning "${c.precedent_search}" in the last year${p.latest ? `, latest: ${p.latest}` : ""}`);
      if (p.count > 0) positive++;
    }
  }

  // How often do PRs from outside the maintainer team get merged, and how fast?
  let rate: number | null = null;
  const closed = await github(`/repos/${c.repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100`);
  if (closed) {
    const external = closed.json.filter(
      (pr: any) => !["OWNER", "MEMBER", "COLLABORATOR"].includes(pr.author_association) && pr.user?.type !== "Bot"
    );
    const merged = external.filter((pr: any) => pr.merged_at);
    if (external.length) {
      rate = merged.length / external.length;
      const days = merged
        .map((pr: any) => (Date.parse(pr.merged_at) - Date.parse(pr.created_at)) / DAY)
        .sort((a: number, b: number) => a - b);
      const median = days.length ? days[Math.floor(days.length / 2)].toFixed(1) : "n/a";
      evidence.push(
        `Outside contributors: ${merged.length}/${external.length} recently closed PRs merged (${Math.round(rate * 100)}%), median ${median} days to merge`
      );
    } else {
      evidence.push("No recently closed PRs from outside contributors");
    }
  } else {
    evidence.push("GitHub API unavailable: set GITHUB_TOKEN to measure precedent PRs and merge rate");
  }

  let verdict: Verdict;
  if (blocked && !c.policy_note) verdict = "fail";
  else if (rate === null && !positive) verdict = "unknown";
  else if (rate !== null && rate < t.min_external_merge_rate) verdict = "weak";
  else if (!positive || friction || blocked) verdict = "weak";
  else verdict = "pass";
  return { name: "Merge", verdict, evidence };
}

async function gateDocs(c: Candidate, t: Thresholds): Promise<Gate> {
  const evidence: string[] = [];
  const d = c.docs;
  if (!d.repo) {
    evidence.push("No public docs repository known. Find the docs source (look for an 'Edit this page' link) before committing to this target.");
    return { name: "Docs", verdict: "fail", evidence };
  }
  if (!d.path) {
    evidence.push(`Docs live in ${d.repo}, but the integrations directory hasn't been located yet`);
    return { name: "Docs", verdict: "weak", evidence };
  }
  let verdict: Verdict = "pass";
  if (d.peer_page) {
    if (await rawExists(d.repo, d.peer_page)) {
      evidence.push(`Peer page to copy: \`${d.repo}/${d.peer_page}\``);
    } else {
      evidence.push(`Peer page \`${d.peer_page}\` not found; the docs may have moved`);
      verdict = "weak";
    }
  } else {
    evidence.push("No peer page identified to use as a template");
    verdict = "weak";
  }
  const commits = await githubCount(`/repos/${d.repo}/commits?path=${encodeURIComponent(d.path)}&since=${isoDaysAgo(90)}T00:00:00Z`);
  if (commits === null) {
    evidence.push("GitHub API unavailable: set GITHUB_TOKEN to measure docs activity");
  } else {
    evidence.push(`${fmt(commits)} commits to \`${d.path}\` in the last 90 days`);
    if (commits < t.min_docs_commits_90d && verdict === "pass") verdict = "weak";
  }
  return { name: "Docs", verdict, evidence };
}

// ---------- Report ----------

const ICON: Record<Verdict, string> = { pass: "✅", weak: "⚠️", fail: "❌", unknown: "❔" };

function overall(gates: Gate[]): string {
  if (gates.some((g) => g.verdict === "fail")) return `NO-GO (${gates.filter((g) => g.verdict === "fail").map((g) => g.name).join(", ")})`;
  if (gates.every((g) => g.verdict === "pass")) return "GO";
  return `INVESTIGATE (${gates.filter((g) => g.verdict !== "pass").map((g) => g.name).join(", ")})`;
}

async function main(opts: { only?: string; report?: string; config: string }) {
  const config = (await Bun.file(opts.config).json()) as Config;
  const candidates = config.candidates.filter((c) => !opts.only || c.name.toLowerCase().includes(opts.only.toLowerCase()));
  if (!process.env.GITHUB_TOKEN) console.warn("GITHUB_TOKEN not set: popularity, precedent and merge-rate metrics may be unknown.\n");

  const rows: { c: Candidate; gates: Gate[]; verdict: string }[] = [];
  for (const c of candidates) {
    // Gates run one after another to stay well inside GitHub's search rate limit
    const gates = [
      await gateFit(c),
      await gatePopularity(c, config.thresholds),
      await gateMerge(c, config.thresholds, config.policy_phrases),
      await gateDocs(c, config.thresholds),
    ];
    rows.push({ c, gates, verdict: overall(gates) });
  }

  const order = (v: string) => (v.startsWith("GO") ? 0 : v.startsWith("INVESTIGATE") ? 1 : 2);
  rows.sort((a, b) => order(a.verdict) - order(b.verdict) || b.c.fit.score - a.c.fit.score);

  const lines: string[] = [
    "| Project | Fit | Popularity | Merge | Docs | Verdict |",
    "|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.c.name} | ${r.gates.map((g) => ICON[g.verdict]).join(" | ")} | ${r.verdict} |`),
    "",
    "✅ pass · ⚠️ weak · ❌ fail · ❔ unknown (set GITHUB_TOKEN)",
    "",
  ];
  for (const r of rows) {
    lines.push(`## ${r.c.name}: ${r.verdict}`, "", `Repo: https://github.com/${r.c.repo}`, "");
    for (const g of r.gates) {
      lines.push(`**${ICON[g.verdict]} ${g.name}**`, "");
      for (const e of g.evidence) lines.push(`- ${e}`);
      lines.push("");
    }
  }
  const md = lines.join("\n");
  console.log(md);
  if (opts.report) await Bun.write(opts.report, `# Integration candidates\n\n${md}\nGenerated by \`bun run utils/evaluate-integration-candidates.ts\`.\n`);
}

new Command()
  .name("evaluate-integration-candidates")
  .description("Score integration candidates on fit, popularity, mergeability and docs access")
  .option("--config <file>", "candidates file", CANDIDATES)
  .option("--only <name>", "evaluate only candidates whose name contains this text")
  .option("--report <file>", "write the Markdown report to this file")
  .action(main)
  .parse();

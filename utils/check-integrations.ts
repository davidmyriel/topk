// usage: bun run utils/check-integrations.ts [--report <file.md>]
//
// Verifies that the third-party integrations TopK claims in docs/integrations
// still exist where we say they do: listing pages still mention TopK, packages
// are still on PyPI, repos still exist and aren't archived, and every external
// link on our integration pages still resolves.
//
// The claims live in utils/integrations.json. Exits 1 if any listed claim fails.

import { Command } from "commander";
import { readdir } from "fs/promises";
import path from "path";

const ROOT = path.resolve(import.meta.dir, "..");
const REGISTRY = path.join(ROOT, "utils/integrations.json");
const INTEGRATIONS_DIR = path.join(ROOT, "docs/integrations");
// Pages in docs/integrations that aren't about a single third-party integration
const NON_INTEGRATION_PAGES = new Set(["index", "build"]);
const STALE_RELEASE_DAYS = 365;
const USER_AGENT = "topk-integrations-check (+https://github.com/topk-io/topk)";

type PageCheck = { type: "page"; url: string; contains: string[]; why?: string };
type PypiCheck = { type: "pypi"; package: string };
type GithubCheck = { type: "github"; repo: string };
type Check = PageCheck | PypiCheck | GithubCheck;
type Integration = {
  name: string;
  status: "listed" | "unlisted";
  page?: string;
  note?: string;
  checks: Check[];
};

type Level = "ok" | "warn" | "fail";
type Result = { level: Level; subject: string; message: string };

async function get(url: string, headers: Record<string, string> = {}): Promise<{ status: number; url: string; body: string } | { error: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": USER_AGENT, ...headers },
        signal: AbortSignal.timeout(30_000),
      });
      const body = await res.text();
      // Retry transient server errors; report everything else as-is
      if (res.status >= 500 && attempt < 2) {
        await Bun.sleep(2000 * (attempt + 1));
        continue;
      }
      return { status: res.status, url: res.url, body };
    } catch (e) {
      if (attempt === 2) return { error: String(e) };
      await Bun.sleep(2000 * (attempt + 1));
    }
  }
  return { error: "unreachable" };
}

async function checkPage(c: PageCheck): Promise<Result> {
  const subject = c.why ?? c.url;
  const res = await get(c.url);
  if ("error" in res) return { level: "fail", subject, message: `${c.url} could not be fetched: ${res.error}` };
  if (res.status !== 200) return { level: "fail", subject, message: `${c.url} returned HTTP ${res.status}` };
  const body = res.body.toLowerCase();
  const missing = c.contains.filter((s) => !body.includes(s.toLowerCase()));
  const redirected = res.url !== c.url ? ` (redirected to ${res.url})` : "";
  if (missing.length) {
    return { level: "fail", subject, message: `${c.url}${redirected} no longer mentions ${missing.map((m) => `"${m}"`).join(", ")}` };
  }
  return { level: "ok", subject, message: `${c.url}${redirected} mentions ${c.contains.map((m) => `"${m}"`).join(", ")}` };
}

async function checkPypi(c: PypiCheck): Promise<Result> {
  const subject = `PyPI package ${c.package}`;
  const res = await get(`https://pypi.org/pypi/${c.package}/json`);
  if ("error" in res) return { level: "fail", subject, message: `PyPI could not be reached: ${res.error}` };
  if (res.status === 404) return { level: "fail", subject, message: `${c.package} is not published on PyPI` };
  if (res.status !== 200) return { level: "fail", subject, message: `PyPI returned HTTP ${res.status}` };
  const data = JSON.parse(res.body);
  const version: string = data.info?.version;
  if (data.info?.yanked) return { level: "fail", subject, message: `${c.package} ${version} is yanked` };
  const uploaded = (data.urls ?? []).map((u: { upload_time_iso_8601: string }) => Date.parse(u.upload_time_iso_8601)).filter(Number.isFinite);
  if (uploaded.length) {
    const days = Math.floor((Date.now() - Math.max(...uploaded)) / 86_400_000);
    if (days > STALE_RELEASE_DAYS) {
      return { level: "warn", subject, message: `${c.package} ${version} is live, but the last release was ${days} days ago` };
    }
  }
  return { level: "ok", subject, message: `${c.package} ${version} is live` };
}

async function checkGithub(c: GithubCheck): Promise<Result> {
  const subject = `GitHub repo ${c.repo}`;
  const token = process.env.GITHUB_TOKEN;
  const res = await get(`https://api.github.com/repos/${c.repo}`, {
    accept: "application/vnd.github+json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  });
  if (!("error" in res) && res.status === 200) {
    const repo = JSON.parse(res.body);
    if (repo.archived) return { level: "fail", subject, message: `${c.repo} is archived` };
    if (repo.full_name.toLowerCase() !== c.repo.toLowerCase()) {
      return { level: "warn", subject, message: `${c.repo} moved to ${repo.full_name}; update the docs` };
    }
    return { level: "ok", subject, message: `${c.repo} exists and is not archived` };
  }
  if (!("error" in res) && res.status === 404) return { level: "fail", subject, message: `${c.repo} does not exist or is private` };
  // Rate-limited or blocked API: fall back to the README so existence is still checked
  const readme = await get(`https://raw.githubusercontent.com/${c.repo}/HEAD/README.md`);
  if (!("error" in readme) && readme.status === 200) {
    return { level: "warn", subject, message: `${c.repo} exists (README found), but the GitHub API was unavailable so archived status is unknown; set GITHUB_TOKEN` };
  }
  const why = "error" in res ? res.error : `HTTP ${res.status}`;
  return { level: "fail", subject, message: `${c.repo} could not be verified (${why})` };
}

function runCheck(c: Check): Promise<Result> {
  switch (c.type) {
    case "page":
      return checkPage(c);
    case "pypi":
      return checkPypi(c);
    case "github":
      return checkGithub(c);
  }
}

// Every external link on our integration pages should still resolve
async function checkDocsLinks(): Promise<Result[]> {
  const files = (await readdir(INTEGRATIONS_DIR)).filter((f) => f.endsWith(".mdx"));
  const links = new Map<string, string[]>();
  for (const file of files) {
    const text = await Bun.file(path.join(INTEGRATIONS_DIR, file)).text();
    for (const m of text.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) {
      const url = m[1];
      // TopK's own sites are covered by the docs build; check third-party links only
      if (/^https:\/\/([a-z]+\.)?topk\.io\b/.test(url)) continue;
      links.set(url, [...(links.get(url) ?? []), file]);
    }
  }
  return Promise.all(
    [...links].map(async ([url, from]): Promise<Result> => {
      const subject = `Link in ${[...new Set(from)].join(", ")}`;
      const res = await get(url);
      if ("error" in res) return { level: "fail", subject, message: `${url} could not be fetched: ${res.error}` };
      if (res.status === 200) return { level: "ok", subject, message: `${url} resolves` };
      // Some hosts block automated clients; don't fail the build on that alone
      if (res.status === 403 || res.status === 429) return { level: "warn", subject, message: `${url} returned HTTP ${res.status} (bot blocking?)` };
      return { level: "fail", subject, message: `${url} returned HTTP ${res.status}` };
    })
  );
}

// Each integration page needs a registry entry, and each listed entry needs its page
async function checkRegistryMatchesDocs(integrations: Integration[]): Promise<Result[]> {
  const results: Result[] = [];
  const pages = (await readdir(INTEGRATIONS_DIR))
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => `integrations/${f.replace(/\.mdx$/, "")}`)
    .filter((p) => !NON_INTEGRATION_PAGES.has(p.split("/")[1]));
  const registered = new Set(integrations.map((i) => i.page).filter(Boolean));
  for (const page of pages) {
    if (!registered.has(page)) {
      results.push({ level: "fail", subject: "Registry", message: `docs/${page}.mdx has no entry in utils/integrations.json` });
    }
  }
  for (const i of integrations) {
    if (i.status === "listed" && !(i.page && pages.includes(i.page))) {
      results.push({ level: "fail", subject: "Registry", message: `${i.name} is listed but docs/${i.page ?? "?"}.mdx does not exist` });
    }
    if (i.status === "unlisted" && i.page && pages.includes(i.page)) {
      results.push({ level: "fail", subject: "Registry", message: `${i.name} is marked unlisted but docs/${i.page}.mdx still exists` });
    }
  }
  return results;
}

const ICON: Record<Level, string> = { ok: "✅", warn: "⚠️", fail: "❌" };

async function main(opts: { report?: string }) {
  const { integrations } = (await Bun.file(REGISTRY).json()) as { integrations: Integration[] };

  const sections: { title: string; results: Result[]; note?: string }[] = [];
  let failed = false;

  for (const i of integrations) {
    const results = await Promise.all(i.checks.map(runCheck));
    if (i.status === "unlisted") {
      // A removed listing is expected to fail its checks; passing means it came back
      const back = results.length > 0 && results.every((r) => r.level === "ok");
      sections.push({
        title: `${i.name} (unlisted)`,
        note: i.note,
        results: [
          back
            ? { level: "warn", subject: i.name, message: `${i.name} lists TopK again; add it back to docs/integrations and mark it listed` }
            : { level: "ok", subject: i.name, message: `still not listed, as expected` },
        ],
      });
      continue;
    }
    if (results.some((r) => r.level === "fail")) failed = true;
    sections.push({ title: i.name, results });
  }

  const docs = [...(await checkRegistryMatchesDocs(integrations)), ...(await checkDocsLinks())];
  if (docs.some((r) => r.level === "fail")) failed = true;
  sections.push({ title: "Docs consistency and links", results: docs });

  for (const s of sections) {
    console.log(`\n${s.title}`);
    for (const r of s.results) console.log(`  ${ICON[r.level]} ${r.subject}: ${r.message}`);
  }
  console.log(failed ? "\nSome integration claims no longer hold." : "\nAll integration claims hold.");

  if (opts.report) {
    const lines = [
      failed
        ? "Some integrations that TopK's docs describe no longer match what is live. Update `docs/integrations/` and `utils/integrations.json`."
        : "All integration claims hold.",
      "",
    ];
    for (const s of sections) {
      lines.push(`### ${s.title}`, "");
      if (s.note) lines.push(`_${s.note}_`, "");
      for (const r of s.results) lines.push(`- ${ICON[r.level]} **${r.subject}**: ${r.message}`);
      lines.push("");
    }
    lines.push("Generated by `bun run utils/check-integrations.ts`.");
    await Bun.write(opts.report, lines.join("\n"));
  }

  process.exit(failed ? 1 : 0);
}

new Command()
  .name("check-integrations")
  .description("Verify third-party integrations listed in docs/integrations still exist")
  .option("--report <file>", "write a Markdown report to this file")
  .action(main)
  .parse();

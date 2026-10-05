import assert from "node:assert/strict";
import test from "node:test";
import { fetchGitHubSkill } from "../../github.js";
import { SkillInputError } from "../../validation.js";

// Direct tests for the GitHub skill fetcher. install-service.unit.test.ts covers one root-folder
// install and one refused host; these pin the URL grammar, the request shape and every refusal.
const COMMIT = "c".repeat(40);
const API = "https://api.github.com/repos/acme/skills";
const URL_REFUSAL = "Use an HTTPS GitHub repository URL, optionally ending in /tree/ref/skill-folder.";
const sha = (n: number) => n.toString(16).padStart(40, "0");
const b64 = (text: string | Buffer) => Buffer.from(text).toString("base64");
type Row = Record<string, unknown>;
const blobRow = (path: string, n: number, size = 4, extra: Row = {}): Row => ({ path, type: "blob", mode: "100644", sha: sha(n), size, ...extra });

/** Strict fake: answers only the URLs it was given, records every request and its init. */
function fakeGitHub(routes: Record<string, () => Response>) {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init: init! });
    const route = routes[String(url)];
    if (!route) throw new Error(`Unexpected fetch: ${url}`);
    return route();
  }) as typeof fetch;
  return { fetchImpl, requests };
}
const refuses = (promise: Promise<unknown>, message: string) => assert.rejects(promise, (error: unknown) => error instanceof SkillInputError && error.message === message);
function repo(tree: Row[], blobs: Record<string, () => Response>, ref = "HEAD", treeExtra: Row = {}) {
  return fakeGitHub({
    [`${API}/commits/${ref}`]: () => Response.json({ sha: COMMIT }),
    [`${API}/git/trees/${COMMIT}?recursive=1`]: () => Response.json({ truncated: false, tree, ...treeExtra }),
    ...Object.fromEntries(Object.entries(blobs).map(([key, value]) => [`${API}/git/blobs/${key}`, value])),
  });
}

test("a /tree/ref/folder URL pins the ref's commit and returns only that folder's allowed files", async () => {
  const wrapped = b64("---\nname: pdf\ndescription: d\n---\n").replace(/(.{20})/g, "$1\n");
  const github = repo([
    { path: 42, type: "blob" },
    blobRow("skills/other/SKILL.md", 9),
    blobRow("skills/pdf/SKILL.md", 1),
    { path: "skills/pdf/references", type: "tree", mode: "040000", sha: sha(2) },
    blobRow("skills/pdf/references/forms.md", 3),
    blobRow("skills/pdf/scripts/fill.py", 4, 4, { mode: "100755" }),
    blobRow("skills/pdf/notes.md", 5),
    blobRow("skills/pdfx/SKILL.md", 6),
  ], {
    [sha(1)]: () => Response.json({ encoding: "base64", content: wrapped }),
    [sha(3)]: () => Response.json({ encoding: "base64", content: b64("forms") }),
    [sha(4)]: () => Response.json({ encoding: "base64", content: b64("print()") }),
  }, "v1.2");
  const url = "https://github.com/acme/skills.git/tree/v1.2/skills/pdf/";
  const result = await fetchGitHubSkill(url, github.fetchImpl);
  assert.deepEqual(result, { source: { githubUrl: url, commit: COMMIT }, files: [
    { path: "SKILL.md", contentBase64: wrapped.replace(/\s/g, "") },
    { path: "references/forms.md", contentBase64: b64("forms") },
    { path: "scripts/fill.py", contentBase64: b64("print()") },
  ] });
  assert.deepEqual(github.requests.map(request => request.url), [`${API}/commits/v1.2`, `${API}/git/trees/${COMMIT}?recursive=1`, `${API}/git/blobs/${sha(1)}`, `${API}/git/blobs/${sha(3)}`, `${API}/git/blobs/${sha(4)}`]);
  for (const { init } of github.requests) {
    assert.equal(init.redirect, "error");
    assert.ok(init.signal instanceof AbortSignal);
    assert.deepEqual(init.headers, { Accept: "application/vnd.github+json" });
  }
});

test("a bare repository URL reads HEAD and the repository root", async () => {
  const github = repo([blobRow("SKILL.md", 1), blobRow("README.md", 2), blobRow("LICENSE", 3), blobRow("docs/x.md", 4)], {
    [sha(1)]: () => Response.json({ encoding: "base64", content: b64("s") }),
    [sha(2)]: () => Response.json({ encoding: "base64", content: b64("r") }),
    [sha(3)]: () => Response.json({ encoding: "base64", content: b64("l") }),
  });
  const result = await fetchGitHubSkill("https://github.com/acme/skills", github.fetchImpl);
  assert.deepEqual(result.files.map(f => f.path), ["SKILL.md", "README.md", "LICENSE"]);
});

test("anything but an https github.com repository URL is refused before any request", async () => {
  const github = fakeGitHub({});
  for (const url of [
    "not a url", "http://github.com/acme/skills", "https://gist.github.com/acme/skills", "https://github.com:8443/acme/skills",
    "https://user@github.com/acme/skills", "https://github.com/acme/skills?ref=x", "https://github.com/acme/skills#readme",
    "https://github.com/acme", "https://github.com/acme/skills/tree", "https://github.com/acme/skills/blob/main/x",
    "https://github.com/acme/skills/tree/main/a%2Fb", "https://github.com/acme/skills/tree/%2e%2e/x", "https://github.com/acme/sk%ills",
    "https://github.com/acme/.git", "https://github.com/acme/sk ills",
  ]) await refuses(fetchGitHubSkill(url, github.fetchImpl), URL_REFUSAL);
  assert.deepEqual(github.requests, []);
});

test("HTTP errors, empty bodies and non-object JSON are refused with actionable messages", async () => {
  const commitUrl = `${API}/commits/HEAD`;
  await refuses(fetchGitHubSkill("https://github.com/acme/skills", fakeGitHub({ [commitUrl]: () => new Response("nope", { status: 404 }) }).fetchImpl), "GitHub could not fetch this skill (HTTP 404). Use a public repository URL.");
  await refuses(fetchGitHubSkill("https://github.com/acme/skills", fakeGitHub({ [commitUrl]: () => new Response(null, { status: 200 }) }).fetchImpl), "GitHub returned an empty response.");
  for (const body of ["[]", "null", "\"sha\""]) {
    await refuses(fetchGitHubSkill("https://github.com/acme/skills", fakeGitHub({ [commitUrl]: () => new Response(body) }).fetchImpl), "GitHub returned an invalid skill response.");
  }
  for (const commit of [undefined, "C".repeat(40), "c".repeat(39)]) {
    await refuses(fetchGitHubSkill("https://github.com/acme/skills", fakeGitHub({ [commitUrl]: () => Response.json({ sha: commit }) }).fetchImpl), "GitHub returned an invalid commit.");
  }
});

test("a response body over twice the skill limit is refused while streaming", async () => {
  const chunk = new Uint8Array(1024 * 1024);
  let pulled = 0;
  // Finite (20 MiB) so a missing limit fails fast instead of hanging the run.
  const body = new ReadableStream<Uint8Array>({ pull(controller) { if (++pulled > 20) controller.close(); else controller.enqueue(chunk); } });
  await refuses(fetchGitHubSkill("https://github.com/acme/skills", fakeGitHub({ [`${API}/commits/HEAD`]: () => new Response(body) }).fetchImpl), "GitHub skill response exceeds its size limit.");
  // 16 MiB is allowed; the 17th MiB trips the limit, so the stream is not drained forever.
  assert.ok(pulled <= 18, `pulled ${pulled} chunks`);
});

test("incomplete trees, links, submodules and bad metadata are refused", async () => {
  const url = "https://github.com/acme/skills";
  await refuses(fetchGitHubSkill(url, repo([], {}, "HEAD", { truncated: true }).fetchImpl), "GitHub repository tree is incomplete. Choose a smaller skill repository.");
  await refuses(fetchGitHubSkill(url, repo([], {}, "HEAD", { tree: "x" }).fetchImpl), "GitHub repository tree is incomplete. Choose a smaller skill repository.");
  for (const row of [blobRow("SKILL.md", 1, 4, { mode: "120000" }), blobRow("references/sub", 1, 4, { type: "commit", mode: "160000" })]) {
    await refuses(fetchGitHubSkill(url, repo([row], {}).fetchImpl), "GitHub skills may contain only regular files.");
  }
  for (const row of [blobRow("SKILL.md", 1, 1024 * 1024 + 1), blobRow("SKILL.md", 1, -1), blobRow("SKILL.md", 1, 4, { size: "4" }), blobRow("SKILL.md", 1, 4, { sha: "z".repeat(40) })]) {
    await refuses(fetchGitHubSkill(url, repo([row], {}).fetchImpl), "GitHub skill file exceeds its size limit or has invalid metadata.");
  }
});

test("declared sizes over 8 MiB are refused before downloading the overflowing blob", async () => {
  const rows = Array.from({ length: 9 }, (_, i) => blobRow(`references/${i}.md`, i + 1, 1024 * 1024));
  const blobs = Object.fromEntries(rows.slice(0, 8).map(row => [row.sha as string, () => Response.json({ encoding: "base64", content: b64("x") })]));
  const github = repo(rows, blobs);
  await refuses(fetchGitHubSkill("https://github.com/acme/skills", github.fetchImpl), "GitHub skill exceeds 8 MiB or 256 files.");
  assert.equal(github.requests.length, 2 + 8);
});

test("more than 256 files is refused", async () => {
  const rows = Array.from({ length: 257 }, (_, i) => blobRow(`references/${i}.md`, i + 1, 1));
  const blobs = Object.fromEntries(rows.map(row => [row.sha as string, () => Response.json({ encoding: "base64", content: b64("x") })]));
  const github = repo(rows, blobs);
  await refuses(fetchGitHubSkill("https://github.com/acme/skills", github.fetchImpl), "GitHub skill exceeds 8 MiB or 256 files.");
  assert.equal(github.requests.length, 2 + 256);
});

test("actual blob bytes are counted, so understated tree sizes cannot exceed 8 MiB", async () => {
  const content = b64(Buffer.alloc(1024 * 1024, 97));
  const rows = Array.from({ length: 9 }, (_, i) => blobRow(`references/${i}.md`, i + 1, 1));
  const github = repo(rows, Object.fromEntries(rows.map(row => [row.sha as string, () => Response.json({ encoding: "base64", content })])));
  await refuses(fetchGitHubSkill("https://github.com/acme/skills", github.fetchImpl), "GitHub skill exceeds 8 MiB or 256 files.");
});

test("blobs that are not base64 content are refused", async () => {
  for (const blob of [{ encoding: "utf-8", content: "x" }, { encoding: "base64", content: 5 }]) {
    await refuses(fetchGitHubSkill("https://github.com/acme/skills", repo([blobRow("SKILL.md", 1)], { [sha(1)]: () => Response.json(blob) }).fetchImpl), "GitHub returned an invalid skill file.");
  }
  await refuses(fetchGitHubSkill("https://github.com/acme/skills", repo([blobRow("SKILL.md", 1)], { [sha(1)]: () => Response.json({ encoding: "base64", content: "a*==" }) }).fetchImpl), "Skill upload must use valid base64.");
});

import assert from "node:assert/strict";
import test from "node:test";
import { createGithubReleaseFeed } from "../github-release-feed.js";

/** @file The desktop and self-hosted release feed is a configured GitHub releases URL, read through an injected fetcher. */

const URL_ = "https://api.example.test/repos/acme/app/releases/latest";

test("reads the configured feed and maps tag and notes to a release", async () => {
  const seen: string[] = [];
  const feed = createGithubReleaseFeed({ feedUrl: URL_, getJson: async ({ url }) => { seen.push(url); return { tag_name: "v1.3.0", body: "Faster pages.", draft: false, prerelease: false }; } });
  assert.deepEqual(await feed.latestRelease({}), { version: "1.3.0", notes: "Faster pages." });
  assert.deepEqual(seen, [URL_]);
});

test("drafts, prereleases and malformed answers are no release", async () => {
  for (const body of [{ tag_name: "v2.0.0", draft: true }, { tag_name: "v2.0.0", prerelease: true }, { body: "no tag" }, null, "nope"]) {
    const feed = createGithubReleaseFeed({ feedUrl: URL_, getJson: async () => body });
    assert.equal(await feed.latestRelease({}), null, JSON.stringify(body));
  }
});

test("a blank feed URL is refused at construction, so no default URL can creep in", () => {
  assert.throws(() => createGithubReleaseFeed({ feedUrl: "  ", getJson: async () => null }), /feed URL/);
});

test("a release tag is trimmed, optional notes are normalized, and the request keeps the caller signal", async () => {
  const signal = new AbortController().signal;
  const seen: unknown[] = [];
  const feed = createGithubReleaseFeed({
    feedUrl: `  ${URL_}  `,
    getJson: async (required, optional) => {
      seen.push([required, optional]);
      return { tag_name: "  v2.7.1  ", body: null };
    },
  });
  assert.deepEqual(seen, []);
  assert.deepEqual(await feed.latestRelease({}, { signal }), { version: "2.7.1", notes: "" });
  assert.deepEqual(seen, [[{ url: URL_ }, { signal }]]);
});

test("an all-whitespace tag never advertises an update, even with valid notes", async () => {
  const feed = createGithubReleaseFeed({ feedUrl: URL_, getJson: async () => ({ tag_name: " \t ", body: "notes" }) });
  assert.equal(await feed.latestRelease({}), null);
});

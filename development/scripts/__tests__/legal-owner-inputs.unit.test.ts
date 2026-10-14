import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");
const slugs = ["privacy-policy", "terms-of-service"] as const;

for (const slug of slugs) {
  test(`${slug} carries no placeholders, draft banner, or first-person owner wording and uses the real contact form for requests and AI reports`, () => {
    const html = read(`content/legal/tovu-dev/${slug}.html`);
    assert.doesNotMatch(html, /\[\[|\]\]|Draft\. Not legal advice|<!--/);
    assert.doesNotMatch(html, /\bmy liability\b|\bone person\b/i);
    assert.match(html, /tovu\.dev/);
    assert.doesNotMatch(html, /mailto:|gdatecorp@gmail\.com|tovu\.com|privacy@|legal@|abuse@/);
    assert.match(html, /id="ai-disclosure"/);
    assert.match(html, /AI (?:can be|output can be) wrong/);
    assert.match(html, /href="\/contact#send-a-message">Report AI content<\/a>/);
    assert.match(html, /Last updated: 2026-10-13/);
  });
}

test("terms use the owner's US$10 cap and California/Los Angeles venue while preserving existing limits and sections", () => {
  const html = read("content/legal/tovu-dev/terms-of-service.html");
  assert.match(html, /total liability[^<]*US\$10\./);
  assert.doesNotMatch(html, /US\s?\$50|greater of|no governing law|no exclusive venue/);
  assert.match(html, /laws of the State of California/);
  assert.match(html, /state or federal courts in Los Angeles County, California/);
  for (const id of ["liability", "warranties", "indemnity", "third-party", "self-host"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /anything else that cannot lawfully be excluded/);
});

test("privacy distinguishes 90-day IP deletion from retention of the submission", () => {
  const html = read("content/legal/tovu-dev/privacy-policy.html");
  assert.match(html, /IP addresses on form submissions are deleted after 90 days/);
  assert.match(html, /answers and timestamp remain until (?:we delete|the submission is deleted)/);
  assert.doesNotMatch(html, /We run no scheduled purge|with the IP stored with them|We keep it until you ask us to delete it/);
  assert.match(html, /data controller/);
  for (const id of ["rights", "self-hosted", "retention"]) assert.match(html, new RegExp(`id="${id}"`));
});

test("privacy drops unsettled-hosting claims but keeps the chat transfer fact", () => {
  const html = read("content/legal/tovu-dev/privacy-policy.html");
  assert.doesNotMatch(html, /not yet settled|not yet deployed|once deployed/i);
  assert.ok(html.includes("<p>Site chat messages go to today's provider, Google, a US company, so they leave the UK and EEA (section 11).</p>"));
});

// 4570fce9d removed the tracked deployed seed DB and site-theme copies. Seed-body parity
// and the seeded contact form no longer have repository subjects; canonical legal HTML
// is covered above, and the remaining templates are owned by content/themes/static.
for (const [theme, terms, privacy] of [
  ["tailark-quartz-dark", "legal-document.html", "legal-document-two.html"],
  ["tailark-quartz-libre", "terms.html", "privacy.html"],
]) {
  test(`content/themes/static/${theme} legal templates retain the owner's inputs and report destination`, () => {
    const base = `content/themes/static/${theme}/render/pages`;
    const termsHtml = read(`${base}/${terms}`);
    const privacyHtml = read(`${base}/${privacy}`);
    assert.match(termsHtml, /total liability[^<]*US\$0/);
    assert.match(termsHtml, /laws of the State of California/);
    assert.match(termsHtml, /Los Angeles County, California/);
    assert.match(privacyHtml, /IP addresses on form submissions are deleted after 90 days/);
    for (const html of [termsHtml, privacyHtml]) {
      assert.match(html, /tovu\.dev/);
      assert.match(html, /href="\/contact#send-a-message">Report AI content<\/a>/);
      assert.doesNotMatch(html, /mailto:|privacy@|legal@|Data Protection Officer at/);
    }
  });
}

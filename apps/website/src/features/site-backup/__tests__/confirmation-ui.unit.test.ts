import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { buildConfirmationSurface } from "../confirmation-ui.js";
import type { SiteBackupPlan } from "../plan-store.js";

// jsdom is declared by the admin workspace; resolve its DOM test dependency there.
const { JSDOM } = createRequire(new URL("../../../../../admin/package.json", import.meta.url))("jsdom");

function plan(overrides: Partial<SiteBackupPlan> = {}): SiteBackupPlan {
  return {
    planId: "plan-8", principalId: "owner", workspaceId: "ws-backup", expiresAtMs: 1000,
    credentialLabel: "Backup credential", owner: "team", repo: "archive", folder: "site-eight", commitMessage: "backup",
    repository: { branch: "backup-branch", parentCommitSha: "tip", baseTreeSha: "tree", htmlUrl: "https://example.test/team/archive", folderExists: true },
    include: { database: true, media: true, themes: true, plugins: true, settings: true },
    database: { bytes: Buffer.from("db"), watermarkAtCapture: 1 }, files: [], skipped: [], scopeNotes: {}, totalBytes: 2,
    site: { name: "Eight", folderName: "site-eight" }, schema: { index: 1, tag: "baseline" }, tovuVersion: "1.0.0", createdAt: "2026-09-29T00:00:00Z",
    ...overrides,
  };
}

function render(p: SiteBackupPlan) {
  const resource = buildConfirmationSurface({ plan: p, exchangeId: "exchange-9" });
  const dom = new JSDOM(resource.resource.text);
  const doc = dom.window.document;
  const rows = Object.fromEntries([...doc.querySelectorAll("dt")].map((label) => [label.textContent, label.nextElementSibling?.textContent]));
  return { resource, dom, doc, rows };
}

// F1.3/F4.1: removing replacement/privacy facts or assigning them to the wrong row fails.
test("dialog names the private target, replacement, scopes, sensitive database and irreversible commit", (t) => {
  const h = render(plan({ skipped: [{ path: "uploads/link", reason: "symlink" }], scopeNotes: { themes: "Only local themes", database: "Consistent snapshot" } }));
  t.after(() => h.dom.window.close());
  assert.equal(h.resource.resource.uri, "ui://tovu/site-backup-push/exchange-9");
  assert.equal(h.doc.querySelector("h1")?.textContent, "Back up this site to team/archive?");
  assert.deepEqual(h.rows, {
    Credential: "Backup credential", Repository: "team/archive (private)", Branch: "backup-branch",
    Folder: "site-eight/ (replaced: its current contents are removed)", Scopes: "database, media, themes, plugins, settings",
    Files: "1 files, 2 B, plus the tovu-backup.json manifest", Database: "2 B snapshot",
    "Left out": "uploads/link: symlink", Notes: "Consistent snapshot\nOnly local themes",
    Contents: "tovu-backup.json (manifest)\ndatabase/content.db (2 B)",
  });
  assert.equal(h.doc.querySelector(".mcpui-warning")?.textContent,
    "The database in this backup holds your members, form submissions, admin accounts and saved credentials (encrypted with this site's Site key). The folder 'site-eight' in team/archive is replaced as a whole: files that are there now and not in this backup are removed from it. Nothing outside that folder changes. This makes a real commit. Tovu cannot undo it.");
  const encoded = h.resource.resource.text.match(/var PLAN = (.*);/);
  assert.ok(encoded);
  assert.deepEqual(JSON.parse(encoded[1]), {
    confirm: { toolName: "site_backup_push", params: { __exchangeId: "exchange-9", decision: "confirm" } },
    cancel: { toolName: "site_backup_push", params: { __exchangeId: "exchange-9", decision: "cancel" } },
  });
});

test("without a database the created folder and excluded scopes are explicit, and optional rows disappear", (t) => {
  const p = plan({ database: null, totalBytes: 0, include: { database: false, media: false, themes: true, plugins: false, settings: true } });
  const h = render({ ...p, repository: { ...p.repository, folderExists: false } });
  t.after(() => h.dom.window.close());
  assert.equal(h.rows.Folder, "site-eight/ (created)");
  assert.equal(h.rows.Scopes, "themes, settings (not included: database, media, plugins)");
  assert.equal(h.rows.Database, "not included");
  assert.equal(h.rows.Files, "0 files, 0 B, plus the tovu-backup.json manifest");
  assert.equal(h.rows.Contents, "tovu-backup.json (manifest)");
  assert.equal(h.rows.Notes, undefined);
  assert.equal(h.rows["Left out"], undefined);
  assert.equal(h.doc.querySelector(".mcpui-warning")?.textContent,
    "The database is not included in this backup. The folder 'site-eight' in team/archive is replaced as a whole: files that are there now and not in this backup are removed from it. Nothing outside that folder changes. This makes a real commit. Tovu cannot undo it.");
});

test("the 200-line cap counts the manifest and database, and reports the exact number omitted", (t) => {
  const files = Array.from({ length: 199 }, (_, i) => ({ path: `uploads/file-${i}`, bytes: 3, scope: "media" as const, absPath: `/unused/${i}`, mtimeMs: 0 }));
  const exact = render(plan({ files: files.slice(0, 198) }));
  const over = render(plan({ files }));
  t.after(() => { exact.dom.window.close(); over.dom.window.close(); });
  assert.deepEqual(exact.rows.Contents?.split("\n"), ["tovu-backup.json (manifest)", "database/content.db (2 B)", ...Array.from({ length: 198 }, (_, i) => `uploads/file-${i} (3 B)`)]);
  assert.deepEqual(over.rows.Contents?.split("\n"), ["tovu-backup.json (manifest)", "database/content.db (2 B)", ...Array.from({ length: 198 }, (_, i) => `uploads/file-${i} (3 B)`), "…and 1 more"]);
});

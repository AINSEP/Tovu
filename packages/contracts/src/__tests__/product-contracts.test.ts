import assert from "node:assert/strict";
import test from "node:test";

import { ASSISTANT_CONTENT_EDIT_GUIDANCE } from "../assistant-content-guidance.js";
import { AGENT_DAEMON_EXIT_CODE, SITE_SLEEP_EXIT_CODE } from "../daemon-exit-codes.js";
import { FS_FOLDER_READ_RECOVERY } from "../fs-folder-recovery.js";
import { resolvePublishHistoryListLimit } from "../publish-history-list-limit.js";
import { REDIRECT_TABLES } from "../redirect-tables.js";
import { SHARE_LIMITS } from "../site-share-limits.js";
import { DESKTOP_AGENT_SERVICE_ENV, STARTUP_SECRET_KEYS } from "../startup-secret-keys.js";
import { WIDGET_REGION_BINDINGS_TABLE } from "../widget-tables.js";

test("content-edit guidance protects concurrent edits and requires consent-aware script declarations", () => {
  assert.match(ASSISTANT_CONTENT_EDIT_GUIDANCE, /Check its format before choosing a writer\./);
  assert.match(ASSISTANT_CONTENT_EDIT_GUIDANCE, /Send the version you read\. On conflict, read again and retry only if the affected content is unchanged\. If it changed, show the overlap and ask which edit to keep\./);
  assert.match(ASSISTANT_CONTENT_EDIT_GUIDANCE, /Load latest discards unsaved edits\./);
  assert.match(ASSISTANT_CONTENT_EDIT_GUIDANCE, /\{src, consent:\[category\]\} rather than pasting executable tracker tags/);
  assert.match(ASSISTANT_CONTENT_EDIT_GUIDANCE, /several categories must all be allowed\. Use window\.jiniConsent\.allows\(\{consent:\[\.\.\.\]\}\)/);
  assert.match(ASSISTANT_CONTENT_EDIT_GUIDANCE, /adding a declaration does not disable the old tag\./);
});

test("folder recovery requires owner selection before reading the custom root and offers attachment import", () => {
  assert.match(FS_FOLDER_READ_RECOVERY, /^Ask the owner to pick that folder with the chat composer folder button .* then call fs_list_files with root:"custom" and media_import_local_file with root:"custom" and the file path relative to that folder\./);
  assert.match(FS_FOLDER_READ_RECOVERY, /ask the owner to attach the file to this chat, then use media_promote_chat_attachment\.$/);
});

test("the parent-child exit protocol distinguishes occupied ports, daemon parking and site sleeping", () => {
  assert.deepEqual(AGENT_DAEMON_EXIT_CODE, { PORT_IN_USE: 87, IDLE_PARK: 88 });
  assert.equal(SITE_SLEEP_EXIT_CODE, 89);
});

test("installed launchers still hand over the same startup-only credential names and control mode switch", () => {
  assert.deepEqual([...STARTUP_SECRET_KEYS].sort(), [
    "JINI_DESKTOP_RENDER_TOKEN", "TOVU_ADMIN_PASSWORD", "TOVU_AGENT_DAEMON_TOKEN",
    "TOVU_DESKTOP_MCP_HANDOFF_TOKEN", "TOVU_DESKTOP_MCP_TOKEN", "TOVU_TOOL_EXEC_TOKEN",
  ]);
  assert.equal(DESKTOP_AGENT_SERVICE_ENV, "TOVU_DESKTOP_AGENT_SERVICE");
});

test("persisted widget and redirect table names stay compatible with existing site backups", () => {
  assert.deepEqual(REDIRECT_TABLES, { redirects: "redirects", revisions: "redirect_revisions", hits: "redirect_hits" });
  assert.equal(WIDGET_REGION_BINDINGS_TABLE, "widget_region_bindings");
});

test("share import and export keep the approved independent resource budgets", () => {
  assert.deepEqual(SHARE_LIMITS, {
    maxArchiveBytes: 314_572_800, maxExpandedBytes: 314_572_800, maxFiles: 2000,
    maxFileBytes: 67_108_864, maxManifestBytes: 2_097_152, maxPathSegments: 32,
  });
});

test("publish history defaults only on omission, truncates fractional sizes and clamps out-of-range limits", () => {
  const cases: ReadonlyArray<readonly [number | undefined, number]> =
    [[undefined, 50], [-7, 1], [0, 1], [1, 1], [32.9, 32], [199, 199], [200, 200], [201, 200]];
  for (const [requested, expected] of cases) assert.equal(resolvePublishHistoryListLimit({ requested }), expected, String(requested));
});

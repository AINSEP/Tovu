import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { EMBED_MARKER_TARGET_KEYS } from "../marker.js";
import { isPageEmbedType } from "../../../../features/widgets/resolver-service.js";

/**
 * @file Bug A (2026-09-23 interactive-bugs plan, Slice A1): keeps `EMBED_MARKER_TARGET_KEYS` — the
 * admin-facing table of "which key names this marker type's target" — honest against the server's own
 * page-embed resolver registry. `isPageEmbedType` (`resolver-service.ts`) is `true` exactly for the
 * types the server resolves by `id`-else-`slug` (widget, media, post, content, per that file's
 * `HTML_EMBED_RESOLVERS`); every one of those MUST carry `"slug"` in its target-key list, or the admin
 * placeholder would silently regress to the id-only bug this plan fixes the moment a future resolver
 * is added without a matching table row.
 *
 * `marker.ts` is deliberately import-free (its own file header: PURE, no I/O, no DOM, no resolution) so
 * the admin can safely alias straight to it without pulling in server-only code. The second assertion
 * below is the boundary guard that keeps that true: it fails loudly the moment anyone adds an `import`
 * line to `marker.ts`.
 */

const PAGE_EMBED_TYPES = ["widget", "media", "post", "content"] as const;

test("marker-target parity: every server-registered page-embed type accepts slug as a fallback target key", () => {
  for (const type of PAGE_EMBED_TYPES) {
    assert.ok(isPageEmbedType(type), `expected "${type}" to be registered in HTML_EMBED_RESOLVERS`);
    const keys = EMBED_MARKER_TARGET_KEYS[type];
    assert.ok(keys, `EMBED_MARKER_TARGET_KEYS is missing an entry for registered type "${type}"`);
    assert.ok(
      keys.includes("slug"),
      `EMBED_MARKER_TARGET_KEYS["${type}"] = ${JSON.stringify(keys)} must include "slug" — the server resolves this type by id, else slug`
    );
  }
});

test("marker.ts stays import-free so the admin's alias never pulls in server-only code", () => {
  const source = readFileSync(fileURLToPath(new URL("../marker.ts", import.meta.url)), "utf8");

  assert.doesNotMatch(source, /^import /m);
});

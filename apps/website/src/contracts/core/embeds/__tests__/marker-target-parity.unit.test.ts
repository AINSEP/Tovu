import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { EMBED_MARKER_TARGET_KEYS, embedMarkerTarget } from "../marker.js";
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
 * the admin can safely alias straight to it without pulling in server-only code. The last test
 * below is the boundary guard that keeps that true: it fails loudly the moment anyone adds an `import`
 * line to `marker.ts`.
 */

/** Reads a sibling source file relative to this test. */
function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

/**
 * The keys of `resolver-service.ts`'s private `HTML_EMBED_RESOLVERS` literal, read from its source.
 * The registry is not exported and not enumerable through `isPageEmbedType`, so a hardcoded type list
 * here would stay green when a fifth resolver is registered without a table row — the exact drift this
 * test exists to catch.
 */
function registeredPageEmbedTypes(): string[] {
  const source = readSource("../../../../features/widgets/resolver-service.ts");
  const body = /const HTML_EMBED_RESOLVERS[^=]*=\s*\{([^}]*)\}/.exec(source)?.[1];
  assert.ok(body, "could not locate the HTML_EMBED_RESOLVERS literal in resolver-service.ts");
  return [...body.matchAll(/^\s*"?([\w-]+)"?\s*:/gm)].map((match) => match[1] as string);
}

test("marker-target parity: the registry scrape finds the four known page-embed types", () => {
  assert.deepEqual(registeredPageEmbedTypes().sort(), ["content", "media", "post", "widget"]);
});

test("marker-target parity: every server-registered page-embed type accepts slug as a fallback target key", () => {
  for (const type of registeredPageEmbedTypes()) {
    assert.ok(isPageEmbedType(type), `expected "${type}" to be registered in HTML_EMBED_RESOLVERS`);
    const keys = EMBED_MARKER_TARGET_KEYS[type];
    assert.ok(keys, `EMBED_MARKER_TARGET_KEYS is missing an entry for registered type "${type}"`);
    assert.ok(
      keys.includes("slug"),
      `EMBED_MARKER_TARGET_KEYS["${type}"] = ${JSON.stringify(keys)} must include "slug" — the server resolves this type by id, else slug`
    );
  }
});

test("marker-target parity: the target-value length bound matches html-embeds.ts's MAX_EMBED_ID_LENGTH", () => {
  const source = readSource("../../../../features/widgets/html-embeds.ts");
  const bound = Number(/const MAX_EMBED_ID_LENGTH = (\d+);/.exec(source)?.[1]);
  assert.ok(Number.isInteger(bound) && bound > 0, "could not read MAX_EMBED_ID_LENGTH from html-embeds.ts");

  assert.deepEqual(embedMarkerTarget("widget", { slug: "s".repeat(bound) }), { key: "slug", value: "s".repeat(bound) });
  assert.equal(embedMarkerTarget("widget", { slug: "s".repeat(bound + 1) }), undefined);
});

test("marker.ts stays import-free so the admin's alias never pulls in server-only code", () => {
  const source = readSource("../marker.ts");

  assert.doesNotMatch(source, /^import /m);
});

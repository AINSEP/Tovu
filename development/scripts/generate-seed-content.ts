/**
 * @file Generates `src/templates/starter/seed-content.json` from `src/server/seed.ts`.
 *
 * Why generate rather than hand-maintain a second copy:
 * `seed.ts`'s `seededWorkspace`/`seededPosts`/`seededPresentation` are the REQ-02 binding source
 * of truth for the starter template's seed content (`read-template.unit.test.ts` asserts
 * `readTemplate('starter').seed` is byte-equivalent to them) — but until now `seed-content.json`
 * was ALSO hand-maintained, as a JSON mirror someone had to remember to update by hand every time
 * `seed.ts` changed. It drifted twice: `0f0de930` (2026-08-19) resynced a stale `activeThemeId`
 * and post ids, then `8c7effea`, the very same day, edited `seed.ts`'s "How Themes Work" post
 * (added the static-tier paragraph and file list) without touching this file, breaking the
 * byte-parity test again. There was no generator either time, only a manual copy — see
 * `ADS-memory/reports/2026-08-21-module-mocks-flag-evaluation.md`'s sibling report on this same
 * date for the investigation that found this. Generating removes the manual-copy step that drifts,
 * the same fix `generate-postgres-schema.ts` applied to `schema.postgres.ts` for the identical
 * reason — this file's structure deliberately mirrors that one.
 *
 * `read-template.ts` (`site-dir` domain) deliberately never imports `server/seed.ts` directly —
 * `site-dir` must stay independent of `server` (Module Map) and a template is data the runtime
 * reads, not a re-export of another module's code. This generator is the one place allowed to
 * cross that boundary, and it runs at author time (or in CI's drift check), never at request time.
 *
 * `TemplateSeedContent` (`site-dir/types.ts`) names the seed's posts field `entries`, not `posts` —
 * `read-template.ts` remaps `seedContent.entries` to `ContentDbSeedData.posts` itself, so this
 * generator carries `seededPosts` under the `entries` key to match the on-disk contract, not
 * `seed.ts`'s own export name.
 *
 * GENERATED FILE — DO NOT hand-edit `src/templates/starter/seed-content.json`. Edit
 * `src/server/seed.ts` and regenerate; a direct edit here will be silently overwritten the next
 * time someone runs the generator, and will fail the drift check (`check-seed-content-drift.ts`)
 * in the meantime.
 *
 * Run: `npx tsx development/scripts/generate-seed-content.ts` (writes the file)
 * Check (CI): `npx tsx development/scripts/generate-seed-content.ts --check` (exits 1 on drift, writes nothing)
 * Also wired as `npm run generate:seed-content` / `npm run check:seed-content-drift`.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { seededPosts, seededPresentation, seededWorkspace } from "../../src/server/seed.js";
import type { TemplateSeedContent } from "../../src/site-dir/types.js";

const OUT_PATH = path.resolve(import.meta.dirname, "../../src/templates/starter/seed-content.json");

/**
 * Throws if any own-enumerable property anywhere in `value` (recursively, through plain objects
 * and arrays) holds `undefined`.
 *
 * Why this exists: `JSON.stringify` silently DROPS an own-enumerable property whose value is
 * `undefined` — it does not error and does not emit `"key":null`, the key simply vanishes from the
 * output (this repo does not set `exactOptionalPropertyTypes`, so TypeScript does not catch this
 * either). That means changing a seeded post from omitting a field entirely to setting it to
 * `undefined` produces byte-IDENTICAL `generate()` output, so `--check` passes even though the live
 * seed object and the parsed JSON now disagree structurally (`"key" in post` and `Object.keys`
 * both differ). `generate()` calls this before stringifying specifically to turn that silent
 * false-pass into a loud failure — see this file's header for the incident that motivated adding
 * it (Sol audit, 2026-08-21).
 *
 * @param value - The data to walk. Only plain objects and arrays are recursed into; other types
 *   (including `null`) are ignored.
 * @param label - Prefix for the thrown error message, identifying which generator/input this
 *   guard is protecting.
 * @throws {Error} On the first `undefined`-valued property found, naming its path (e.g.
 *   `$.entries[1].ext`).
 * @complexity O(n) in the total number of object/array entries in `value`. Cycle-safe via a
 *   `WeakSet` of visited objects (seed data has no cycles today, but this guard has no reason to
 *   assume that forever).
 */
export function assertNoUndefinedProperties(value: unknown, label: string): void {
  const visited = new WeakSet<object>();

  function walk(node: unknown, path: string): void {
    if (node === null || typeof node !== "object") return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }

    for (const [key, entryValue] of Object.entries(node)) {
      const entryPath = `${path}.${key}`;
      if (entryValue === undefined) {
        throw new Error(
          `${label}: property '${entryPath}' is undefined -- JSON.stringify silently drops ` +
            "undefined-valued properties, which would make generated output byte-identical to a " +
            "version WITHOUT this property and hide real structural drift from `--check`. Remove " +
            "the property entirely instead of setting it to undefined."
        );
      }
      walk(entryValue, entryPath);
    }
  }

  walk(value, "$");
}

/**
 * Renders `seed.ts`'s three live exports into `seed-content.json`'s exact on-disk text.
 *
 * Deliberately a plain `JSON.stringify` of the exports in their own declared field order (no
 * hand-built key list): `seed.ts`'s object literals already declare `id`/`name`/`slug`/... etc. in
 * the order the checked-in file uses today, so reproducing them via `JSON.stringify` needs no
 * separate ordering to go stale against — see this file's own header on why keeping the two in
 * sync by hand is exactly the failure mode this generator exists to remove.
 *
 * @returns The full file text, 2-space indented, one trailing newline — matches
 *   `generate-postgres-schema.ts`'s own convention and the checked-in file's current formatting.
 * @throws {Error} Via `assertNoUndefinedProperties`, if any seeded field is `undefined` rather
 *   than omitted — see that function's own doc for why this must fail loudly here.
 * @complexity O(n) in the seed content's own size (fixed, not caller-controlled).
 * @overallScore 100
 */
export function generate(): string {
  const content: TemplateSeedContent = {
    workspace: seededWorkspace,
    entries: seededPosts,
    presentation: seededPresentation,
  };
  assertNoUndefinedProperties(content, "seed-content generator input");
  return `${JSON.stringify(content, null, 2)}\n`;
}

function main(): void {
  const generated = generate();
  const check = process.argv.includes("--check");

  if (!check) {
    fs.writeFileSync(OUT_PATH, generated, "utf8");
    process.stdout.write(`wrote ${path.relative(process.cwd(), OUT_PATH)}\n`);
    return;
  }

  const current = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, "utf8") : "";
  if (current === generated) {
    process.stdout.write("seed-content.json is up to date with seed.ts\n");
    return;
  }
  process.stderr.write(
    "DRIFT: src/templates/starter/seed-content.json does not match what src/server/seed.ts generates.\n" +
      "Run `npm run generate:seed-content` and commit the result.\n"
  );
  process.exit(1);
}

// Only run when invoked directly, never as a side effect of import — mirrors
// generate-postgres-schema.ts's own guard, for the same reason: `generate()` is also imported
// directly by development/scripts/__tests__/generate-seed-content.unit.test.ts, which must never
// write or drift-check the real checked-in file as a side effect of importing a pure function.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

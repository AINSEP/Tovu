/**
 * @file Site-key plan (`ADS-memory/.local-artifacts/plan-site-key-2026-09-24.md`) §A3a: "no file
 * under `server/inbound/**` imports `site-key-ensure`" — `site-key-ensure.ts` is the one WRITER of
 * a site's key file (race-safe, but still a write with no single-instance lock; see that module's
 * own header). Nothing on a request path may reach it — only the two real boot entrypoints
 * (`cli/commands/serve.ts`, `src/index.ts`) may call `ensureSiteKeyForBoot`. A route that read the
 * per-site key file's candidate list still may (`site-key-sources.ts`'s `resolveSiteKeyId`,
 * `siteKeySources`, `siteKeyFilePathFrom` — pure readers, a separate module by design for exactly
 * this reason) — only the writer is fenced off here.
 *
 * Modeled on `apps/website/src/features/__tests__/features-no-server-imports.boundary.test.ts`:
 * scan every production `.ts`/`.tsx` under `server/inbound/`, extract every import specifier
 * (`import`, `import type`, dynamic `import()`, and `require()`), and flag any that name
 * `site-key-ensure` — relative, or via the `#src/features/webhooks/site-key-ensure` subpath map.
 * `__tests__/` is excluded, same reasoning as the features boundary test: an integration test that
 * boots a real route against a controlled writer call is orthogonal to this production-layering
 * concern.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../../..");
const INBOUND_ROOT = path.join(REPO_ROOT, "apps", "website", "src", "server", "inbound");

const SKIP_DIR_NAMES = new Set(["node_modules", "dist", "build", "coverage", "__tests__"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

/**
 * Every import specifier, whatever the syntax. Matches `from "x"`, `import("x")` and `require("x")`
 * so `import`, `export ... from`, `import type`, dynamic import and CJS require are all covered by
 * one pattern rather than four that could drift apart.
 */
const SPECIFIER_PATTERN = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)(["'])([^"']+)\1/g;

/** `site-key-ensure`, `site-key-ensure.js`, or `site-key-ensure.ts` as the specifier's final path
 *  segment — matches both a relative import and the `#src/...` subpath-map form without also
 *  matching an unrelated module that merely contains the substring (e.g. a hypothetical
 *  `site-key-ensure-utils`). */
const SITE_KEY_ENSURE_SPECIFIER = /(?:^|\/)site-key-ensure(?:\.(?:js|ts))?$/;

function collectProductionFiles(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectProductionFiles(full, out);
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
}

test("no production file under server/inbound/ imports site-key-ensure (the one site-key writer)", () => {
  const files: string[] = [];
  collectProductionFiles(INBOUND_ROOT, files);
  assert.ok(
    files.length > 200,
    `sanity check: expected hundreds of production files under server/inbound/, found ${files.length} — ` +
      `a collector that silently walked nothing would make this test pass by scanning zero files`,
  );

  const offenders: string[] = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(SPECIFIER_PATTERN)) {
      if (SITE_KEY_ENSURE_SPECIFIER.test(match[2])) {
        offenders.push(`${path.relative(REPO_ROOT, file)} imports site-key-ensure: "${match[2]}"`);
      }
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `site-key plan §A3a: nothing under server/inbound/ may import site-key-ensure.ts, the one ` +
      `writer. Offending edges:\n  ${offenders.join("\n  ")}`,
  );
});

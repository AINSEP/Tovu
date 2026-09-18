/**
 * @file Regression test for the 2026-09-18 stale-preload incident: `dist/preload/preload.mjs` — the
 * COMPILED file Electron actually loads (`preload.mts`'s own header: "Electron's sandboxed preload
 * loader runs neither TypeScript nor ESM") — was two days older than `src/preload/preload.mts` when
 * the find-in-page feature (`use-find-in-page.hooks.ts`) added `onFindToggle`/`findInPage`/
 * `stopFindInPage`/`onFindResult` to the exposed bridge. `npm run build:preload` was never re-run.
 *
 * The result was not "Cmd+F silently does nothing" — it was worse: `useFindInPage`'s
 * `bridge.onFindToggle(...)` call runs unconditionally in an effect at `App`'s TOP LEVEL (not
 * gated behind any user action), so calling a `.onFindToggle` that the stale bridge did not have
 * threw `r.onFindToggle is not a function` on every single load of the sites-home window, leaving
 * a permanently blank white page. Caught only by a live Playwright `_electron` run
 * (`ADS-memory/.local-artifacts/find-in-page-screenshots-2026-09-18/`), which is the RED evidence
 * for this test: reproduced with the stale dist/preload, gone immediately after `npm run
 * build:preload`. See the handoff at `ADS-memory/.local-artifacts/handoffs/` for the same date.
 *
 * `dist/renderer` has `watch:renderer` keeping it live during dev; `dist/preload` has no watcher at
 * all (`package.json`'s `scripts` has no `watch:preload`), so nothing short of a check like this one
 * catches the drift between "edited preload.mts" and "ran the build" in a local dev loop — the
 * packaging pipeline is not at risk (`npm run package` always runs `npm run build` immediately
 * before staging), but `electron .`/`npm run dev` used directly is exactly the incident's shape.
 *
 * Reuses `shellStalenessFailure`, the SAME pure predicate `scripts/stage-payload.ts` already uses to
 * refuse a stale `apps/admin`/`apps/site-chat` bundle (`shell-staleness.ts`'s own header records
 * that original incident) — this is that same class of bug, one directory over, so the same check
 * rather than a new one.
 *
 * Passes (does not refuse) on a fresh, never-built checkout: {@link shellStalenessFailure} treats a
 * missing build as "nothing to compare", by design — see its own doc.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { shellStalenessFailure, type StalenessShell } from "../shell-staleness.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, "..", "..");

const PRELOAD_SHELL: StalenessShell = {
  relative: path.join("dist", "preload"),
  marker: "preload.mjs",
  buildWith: "npm run build:preload",
};

/** `0` (never stale — see {@link shellStalenessFailure}'s own doc) when `p` does not exist, the
 *  same "absent means nothing to compare" convention the real staleness predicate expects. */
function mtimeMsOrZero(p: string): number {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

test("dist/preload/preload.mjs is not older than its own source (the 2026-09-18 stale-bridge incident)", () => {
  const builtAt = mtimeMsOrZero(path.join(desktopDir, "dist", "preload", "preload.mjs"));
  const sourceAt = mtimeMsOrZero(path.join(desktopDir, "src", "preload", "preload.mts"));

  const failure = shellStalenessFailure(builtAt, sourceAt, PRELOAD_SHELL);

  assert.equal(failure, null, failure ?? undefined);
});

test("the staleness predicate itself refuses the exact incident shape (build older than the source that added onFindToggle)", () => {
  const staleBuildTime = Date.parse("2026-09-16T08:47:00Z");
  const editedSourceTime = Date.parse("2026-09-18T11:30:00Z");

  const failure = shellStalenessFailure(staleBuildTime, editedSourceTime, PRELOAD_SHELL);

  assert.ok(failure, "a preload built before the source that added onFindToggle must be refused");
  assert.match(failure, /STALE/);
  assert.match(failure, /npm run build:preload/);
});

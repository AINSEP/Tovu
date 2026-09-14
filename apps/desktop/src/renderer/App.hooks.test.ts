/**
 * @file Behavioural tests for the plain rules `App.hooks.ts` keeps out of the components —
 * `siteSlug`, `computeCanCreate`, and the handler builders pulled out of `App.tsx`'s component
 * bodies (`countRunningSites`, `navLinkClick`, `settingsControlHandlers`, `startThenNotify`) — run
 * against the real functions, not against their source text.
 *
 * **How this file runs.** `apps/desktop`'s `test` script is two commands: a bare
 * `node --test "src/*.test.ts" "src/!(renderer|contracts)/**\/*.test.ts"` first, which has no
 * runner for TypeScript imported across a `.js`-specifier boundary (see `folder-drop.ts`'s own
 * header for why); that is why every renderer test before this one was a source-text assertion (see
 * `rescan-wiring.test.ts`'s own header). This file, living under `src/renderer/`, is executed by the
 * second command instead, `node --import tsx --test "src/renderer/**\/*.test.ts" "src/contracts/**\/*.test.ts"`.
 *
 * `tsx` is this package's OWN devDependency, declared at the same `^4.19.3` the repo root declares.
 * It briefly was not: the script worked only because Node resolves a bare specifier by walking up to
 * the root's `node_modules` — an undeclared dependency on the parent tree, in a package whose own
 * header calls itself self-contained. Declared here, `require.resolve` answers
 * `apps/desktop/node_modules/tsx` and the package stands on its own.
 *
 * Co-located `*.test.ts` beside the unit it covers, matching this package's existing `*.test.cjs`
 * convention rather than the repo-wide `__tests__/unit/` layout.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  computeCanCreate,
  countRunningSites,
  navLinkClick,
  settingsControlHandlers,
  siteSlug,
  startThenNotify,
} from "./App.hooks.js";
import type { SiteRecord } from "../contracts/project.js";
import type { SetStateAction } from "react";

/** The form's real gate: `useCreateWebsiteForm` computes `slug` from the typed name and hands it
 *  straight to `computeCanCreate`, so an empty slug is a permanently disabled "Create website". */
function canCreateSqliteSiteNamed(name: string): boolean {
  return computeCanCreate({ slug: siteSlug(name), database: "sqlite", supabaseReady: false, customReady: false });
}

test("siteSlug keeps its existing behaviour for plain ASCII names", () => {
  assert.equal(siteSlug("Hello World"), "hello-world");
  assert.equal(siteSlug("Corner Bakery!!"), "corner-bakery");
  assert.equal(siteSlug("  Trimmed  "), "trimmed");
});

test("siteSlug still yields nothing for a name with no letters or digits in it", () => {
  // The empty result is what `computeCanCreate` reads as "no name typed yet", so this must keep
  // meaning exactly that — the fix below must not turn punctuation into a usable name.
  assert.equal(siteSlug("   "), "");
  assert.equal(siteSlug("!!!"), "");
  assert.equal(siteSlug("— …"), "");
});

test("a non-Latin website name is not erased, so its site can actually be created", () => {
  // The defect: `[^a-z0-9]+` deletes every character of a name written in a non-Latin script, the
  // slug comes back empty, and `computeCanCreate` then refuses to enable "Create website" — there
  // is no name the operator can type in Japanese, Hindi or Greek that this form will accept.
  for (const name of ["日本語サイト", "हिन्दी", "Ελλάδα", "Кофейня", "مقهى"]) {
    assert.notEqual(siteSlug(name), "", `${name}: an ASCII-only slug erases this name entirely`);
    assert.equal(canCreateSqliteSiteNamed(name), true, `${name}: "Create website" must be reachable`);
  }
});

test("a Latin name carrying diacritics is not mangled into nonsense", () => {
  // Shown to the operator verbatim as "Workspace folder: caf-m-nster" before the fix — the accented
  // letters were replaced by separators rather than kept.
  assert.equal(siteSlug("Café Münster"), "café-münster");
  assert.equal(siteSlug("Łódź Studio"), "łódź-studio");
});

test("combining marks stay attached to the letter they belong to", () => {
  // Devanagari writes its vowels as combining marks (`\p{M}`), not letters. Keeping only `\p{L}`
  // would split हिन्दी into three separator-joined fragments instead of one word.
  assert.equal(siteSlug("हिन्दी"), "हिन्दी");
});

/** A `SiteRecord` stand-in: `countRunningSites` reads nothing but `status`. */
function siteWithStatus(status: SiteRecord["status"]): SiteRecord {
  return { id: `/sites/${status}`, status } as unknown as SiteRecord;
}

test("countRunningSites counts running sites and nothing else", () => {
  const projects = (["running", "starting", "running", "provisioning", "blocked"] as const).map(siteWithStatus);
  assert.equal(countRunningSites(projects), 2);
  assert.equal(countRunningSites([]), 0);
});

test("a NavLink click selects its own section when the link is enabled", () => {
  for (const disabled of [false, undefined]) {
    const selected: string[] = [];
    navLinkClick({ disabled, id: "projects", onSelectSection: (id) => selected.push(id) })();
    assert.deepEqual(selected, ["projects"], `disabled=${disabled}`);
  }
});

test("a disabled NavLink never fires onSelectSection", () => {
  // `aria-disabled`, not the native attribute, so the button still receives the click; this guard is
  // the only thing keeping an unbuilt section (Marketplace, today) from being selected.
  const selected: string[] = [];
  navLinkClick({ disabled: true, id: "marketplace", onSelectSection: (id) => selected.push(id) })();
  assert.equal(selected.length, 0);
});

/** `settingsControlHandlers` over a live open flag, recording every effect in order. */
function recordingSettings(disabled: boolean) {
  const calls: string[] = [];
  let open = false;
  const handlers = settingsControlHandlers({
    disabled,
    setOpen: (next: SetStateAction<boolean>) => {
      open = typeof next === "function" ? next(open) : next;
      calls.push(`open:${open}`);
    },
    onThemeChange: (theme) => calls.push(`theme:${theme}`),
    onOpenAppearance: () => calls.push("appearance"),
  });
  return { calls, handlers };
}

test("the Settings gear flips its dropdown open, then shut", () => {
  const { calls, handlers } = recordingSettings(false);
  handlers.toggleOpen();
  handlers.toggleOpen();
  assert.deepEqual(calls, ["open:true", "open:false"]);
});

test("a disabled Settings gear never opens its dropdown", () => {
  const { calls, handlers } = recordingSettings(true);
  handlers.toggleOpen();
  assert.equal(calls.length, 0);
});

test("picking a theme applies it FIRST, then closes the dropdown", () => {
  const { calls, handlers } = recordingSettings(false);
  handlers.chooseTheme("dark");
  assert.deepEqual(calls, ["theme:dark", "open:false"]);
});

test("the Appearance link closes the dropdown FIRST, then opens the page", () => {
  const { calls, handlers } = recordingSettings(false);
  handlers.openAppearancePage();
  assert.deepEqual(calls, ["open:false", "appearance"]);
});

test("Start waits for start to settle before notifying the caller", async () => {
  const calls: string[] = [];
  const pending: { finish?: (started: boolean) => void } = {};
  const handleStart = startThenNotify(
    () =>
      new Promise<boolean>((resolve) => {
        calls.push("start");
        pending.finish = resolve;
      }),
    () => calls.push("onStarted"),
  );
  const done = handleStart();
  assert.deepEqual(calls, ["start"], "onStarted must not run while start is still in flight");
  pending.finish?.(true);
  await done;
  assert.deepEqual(calls, ["start", "onStarted"]);
});

test("Start with no onStarted just runs start", async () => {
  const calls: string[] = [];
  await startThenNotify(async () => {
    calls.push("start");
    return true;
  }, undefined)();
  assert.deepEqual(calls, ["start"]);
});

test("a start that rejects skips onStarted, and the SAME rejection reaches the caller", async () => {
  const failure = new Error("bridge gone");
  const calls: string[] = [];
  await assert.rejects(
    startThenNotify(async () => {
      throw failure;
    }, () => calls.push("onStarted")),
    (error) => error === failure,
  );
  assert.equal(calls.length, 0);
});

test("a start that RESOLVES but reports failure (useSiteStart's bridge-missing/caught-error path) skips onStarted", () => {
  // useSiteStart's `start` never rejects — a missing bridge or a caught `startSite` error both set
  // `error` state and resolve normally, so `startThenNotify` cannot tell success from failure by
  // whether the promise rejected. It must read the resolved value instead.
  const calls: string[] = [];
  const handleStart = startThenNotify(
    async () => {
      calls.push("start");
      return false;
    },
    () => calls.push("onStarted"),
  );
  return handleStart().then(() => {
    assert.deepEqual(calls, ["start"], "onStarted must not fire after a failed start");
  });
});

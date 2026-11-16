# admin/features/sites (W1 #31, level 3): 4 slices, run in this order
Written 2026-11-16 from Tovu b28d38c6 / Jini b7666092 (refactor/terra); skeleton by make-sheet.py. Tier: Sonnet executes every slice; no owner question.
kind: UI (feature label). Per file, re-kinded after reading the code:
  - use-sites-home.hooks.ts: DELETE (0 prod callers) -> slice DL-admin-sites-1
  - use-site-card-preview.hooks.ts: UI, behaviour moves INTO Jini `SiteCard` (failed-src fallback) -> slice UI-admin-sites-2 (behaviour change in Jini: failing test first)
  - use-site-confirm.hooks.ts: survey "DEDUPE into panel-kit"; Jini has no promise-confirm hook, so it is a MOVE of the generic core into `@jini-ai/ui/panel-kit` (new export `usePromiseConfirm`) -> slice UI-admin-sites-3
  - use-site-list-prefs.hooks.ts: survey "DEDUPE-AFTER-HARDENING"; Jini site-card has the prefs model but not the hook, so it is a MOVE of `useSiteListPrefs` into `@jini-ai/ui/site-card` with an injected `describeError` -> slice UI-admin-sites-4
untangle_overlap: none (no *.repoint.tsv row names any file below).
Jini target is `ui` itself: no kit injection (COMMON rule 6 does not apply to ui's own code). Rule 5: Jini files import only react, their own leaf files, @jini-ai/core.

## Slice DL-admin-sites-1 (T-DELETE)
tovu_file: apps/admin/src/features/sites/hooks/use-sites-home.hooks.ts | blob 0156e8c0fbe8d31ffb8c3f80e8e363948a8f7ab8
non_reexport_statements: 1 (useSitesHome) — survey: dead, 0 prod callers
why_dead: dead-root (only importer is its own test)
tovu_file_after: delete
census: apps/admin/src/features/sites/__tests__/sites-home-setting.unit.test.tsx:4 | static | "../hooks/use-sites-home.hooks"
reach_check: rg -n --no-heading -F "use-sites-home.hooks" apps content development .github package.json --glob '!**/node_modules/**' -> only the census line (desktop `sites-home-view.ts` etc. are a different name and do not match)
importers: - ; folds: - ; comment_refs: - ; path_literals: - ; baselines: -
tests: apps/admin/src/features/sites/__tests__/sites-home-setting.unit.test.tsx | blob 6d40bb91bf8330aab47af52a0a3c657b4c54d953 | delete (it tests only useSitesHome; every case dies with the code)
not in this slice (decided): `api.setSitesHome` (apps/admin/src/lib/api.ts:4084) and its test (lib/__tests__/api-system-endpoints.unit.test.ts:43) are now unused by the admin. They belong to the admin/lib feature (api.ts is a shared hot file); untangle_followup: "admin/lib sheet: api.setSitesHome has 0 callers after DL-admin-sites-1; delete with its test there."
jini_commit: -
tovu_msg: "refactor(admin-sites): delete the unused useSitesHome hook"
Commit paths: the two deleted files.

## Slice UI-admin-sites-2 (T-UI): the failed-preview fallback moves into SiteCard
tovu_files:
  - apps/admin/src/features/sites/hooks/use-site-card-preview.hooks.ts | blob 64f51c6c7036ea040f1a2ef35b6510d980487930 | keep-reduced (resolveSiteCardPreview stays: Tovu URL builder `adminSitePreviewUrl`)
  - apps/admin/src/features/sites/AllSitesTab.tsx | blob 49826cf436e82d61eb4c088aa1ebafbd0acd4dfc
jini guards: packages/ui/src/features/site-card/SiteCard.tsx | blob 1d08dd210ecb80c57655be77141d0ae06f019b38 ; packages/ui/src/features/site-card/__tests__/site-card.unit.test.tsx | blob f05a7aad92abc7f542faf562d154930f9215997f
jini_target: ui ./site-card (existing subpath, no new export) | kit_injection: -
Jini edits (SiteCard.tsx, exact old -> new, each once):
  - "import type { HTMLAttributes, ReactNode } from \"react\";" -> "import { useState, type HTMLAttributes, type ReactNode } from \"react\";"
  - replace the whole function from "function SiteCardTile({ previewSrc, onPreviewError }: Pick<SiteCardProps, \"previewSrc\" | \"onPreviewError\">) {" through its closing "}" (the line before the blank line and "/** The whole card;") with:
```tsx
function SiteCardTile({ previewSrc, onPreviewError }: Pick<SiteCardProps, "previewSrc" | "onPreviewError">) {
  // A URL that failed to load shows the placeholder until the host passes a new URL (a new capture),
  // so a broken or deleted file never leaves the browser's broken-image glyph on the card.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = previewSrc && previewSrc !== failedSrc ? previewSrc : null;
  const onError = () => { setFailedSrc(previewSrc ?? null); onPreviewError?.(); };
  // Decorative: the name right below already says which site this is.
  return (
    <div className="jini-site-card__tile" aria-hidden="true">
      {src ? (
        <img className="jini-site-card__preview" src={src} alt="" loading="lazy" decoding="async" onError={onError} />
      ) : (
        <svg className="jini-site-card__placeholder" viewBox="0 0 48 36" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1" y="1" width="46" height="34" rx="4" />
          <path d="M1 9h46M7 5h.01M11 5h.01M15 5h.01M9 17h30M9 23h20" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}
```
  - The tile's doc line "/** The placeholder keeps the tile's shape and tells nothing false about the site. @complexity O(1). */" stays unchanged above it.
  - Also the `onPreviewError` prop doc in SiteCardProps: leave unchanged (still called).
jini_tests (failing first, RED on the parent: today the img stays after an error): in site-card.unit.test.tsx, after the closing "  });" of the test "shows the capture when there is one and a neutral placeholder otherwise" insert (blank line, then):
```tsx
  it("swaps a failed capture for the placeholder until a new URL arrives", () => {
    const { container, rerender } = render(<SiteCard name="Atlas" previewSrc="/shot.png?v=1" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".jini-site-card__placeholder")).not.toBeNull();
    rerender(<SiteCard name="Atlas" previewSrc="/shot.png?v=2" />);
    expect(container.querySelector("img")!.getAttribute("src")).toBe("/shot.png?v=2");
  });
```
changeset: .changeset/ui-site-card-failed-preview.md: `"@jini-ai/ui": patch` | "`SiteCard` shows the placeholder after its preview image fails to load, until `previewSrc` changes."
jini_msg: "fix(ui): SiteCard falls back to the placeholder when the preview image fails"
Tovu edits:
  - AllSitesTab.tsx: "import { useSiteCardPreview } from \"./hooks/use-site-card-preview.hooks\";" -> "import { resolveSiteCardPreview } from \"./hooks/use-site-card-preview.hooks\";"
  - AllSitesTab.tsx: "  const preview = useSiteCardPreview({ site, snapshot });" -> "  const preview = resolveSiteCardPreview({ site, snapshot });"
  - AllSitesTab.tsx: delete the line "      onPreviewError={preview.onError}" (exactly once)
  - use-site-card-preview.hooks.ts: delete from the line "/**" that directly precedes " * {@link resolveSiteCardPreview} plus the one piece of state it needs: an image URL that failed to" through the end of file (the useSiteCardPreview doc + function); then the file must end with "}\n" after resolveSiteCardPreview. Delete the line "import { useCallback, useState } from \"react\";". In the @file header, after the last line " * URL. The server decides when to capture — see `site-preview-service.ts` in the website app." insert " * A URL that fails to load falls back to the placeholder inside `@jini-ai/ui/site-card`'s `SiteCard`."
census: python3 scripts/census.py <TOVU> apps/admin/src/features/sites/hooks/use-site-card-preview.hooks.ts -> AllSitesTab.tsx:25, __tests__/site-card-preview.unit.test.tsx:6 (both keep importing resolveSiteCardPreview). `rg -n -w useSiteCardPreview apps/admin/src` after: no hit.
class_renames: none (classes already jini-). agent_handles: unchanged. i18n: unchanged.
tests: Tovu __tests__/site-card-preview.unit.test.tsx (blob 887f3b4ede1bd7649a11e691af5c08e38e5add04) unchanged: its "swaps a failed image for the placeholder until a new capture changes the URL" case now passes through Jini.
tovu_msg: "refactor(admin-sites): the failed-preview fallback lives in SiteCard"
look: Sites page, All sites tab: a site with a capture shows the image; rename the capture file on disk -> the card shows the placeholder, no broken-image glyph.

## Slice UI-admin-sites-3 (T-UI, hook move): usePromiseConfirm into @jini-ai/ui/panel-kit
tovu_files: apps/admin/src/features/sites/hooks/use-site-confirm.hooks.ts | blob 7037b24ec8b2b66b7d7a67910584dcf492598b3f | keep-reduced
split: ConfirmableSiteAction STAY-PRODUCT; SITE_CONFIRM_PRESENTATION STAY-PRODUCT; useSiteConfirm STAY-WIRING (reduced to presentation over the Jini hook); SiteConfirmController STAY; promise core (request state + resolver ref + confirm + settle) MOVE -> Jini usePromiseConfirm.
jini guards: packages/ui/src/features/panel-kit/hooks/use-promise-confirm.hooks.ts must not exist; `rg -n "usePromiseConfirm|PromiseConfirm" packages/ui/src` prints nothing; packages/ui/src/features/panel-kit/index.ts | blob c29ac9d2bee400745ea92a2d68668d8111533813
jini_code (new file packages/ui/src/features/panel-kit/hooks/use-promise-confirm.hooks.ts):
```ts
import { useCallback, useRef, useState } from "react";

/**
 * @file A confirmation that a caller can `await`, rendered by whatever modal the host mounts
 * (replaces `window.confirm`).
 */

export interface PromiseConfirm<Request> {
  /** Opens the dialog for `request`; resolves `true` on confirm, `false` on cancel or when replaced. */
  confirm: (required: Request, optional?: Record<string, never>) => Promise<boolean>;
  /** The open request, or `null` when no dialog is open. */
  request: Request | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Promise-shaped confirmation. A second request while one is open cancels the first, so no caller
 * is left awaiting forever.
 * @complexity O(1) per request.
 */
export function usePromiseConfirm<Request>(): PromiseConfirm<Request> {
  const [request, setRequest] = useState<Request | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const confirm = useCallback((next: Request, _optional: Record<string, never> = {}) => {
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setRequest(next);
    });
  }, []);
  const settle = useCallback((ok: boolean) => {
    const resolve = resolver.current;
    resolver.current = null;
    setRequest(null);
    resolve?.(ok);
  }, []);
  return { confirm, request, onConfirm: () => settle(true), onCancel: () => settle(false) };
}
```
jini_index (panel-kit/index.ts): after "export type { SettlementGeneration } from './hooks/use-settlement-generation.hooks.js';" insert
  "export { usePromiseConfirm } from './hooks/use-promise-confirm.hooks.js';\nexport type { PromiseConfirm } from './hooks/use-promise-confirm.hooks.js';"
jini_tests (new file packages/ui/src/features/panel-kit/hooks/__tests__/use-promise-confirm.hooks.test.ts):
```ts
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { usePromiseConfirm } from "../use-promise-confirm.hooks";

describe("usePromiseConfirm", () => {
  it("opens with the request and resolves true on confirm", async () => {
    const { result } = renderHook(() => usePromiseConfirm<{ id: string }>());
    let answer!: Promise<boolean>;
    act(() => { answer = result.current.confirm({ id: "a" }); });
    expect(result.current.request).toEqual({ id: "a" });
    act(() => result.current.onConfirm());
    await expect(answer).resolves.toBe(true);
    expect(result.current.request).toBeNull();
  });

  it("resolves false on cancel", async () => {
    const { result } = renderHook(() => usePromiseConfirm<string>());
    let answer!: Promise<boolean>;
    act(() => { answer = result.current.confirm("x"); });
    act(() => result.current.onCancel());
    await expect(answer).resolves.toBe(false);
  });

  it("settles an open request as false when a second one replaces it", async () => {
    const { result } = renderHook(() => usePromiseConfirm<string>());
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => { first = result.current.confirm("one"); });
    act(() => { second = result.current.confirm("two"); });
    await expect(first).resolves.toBe(false);
    expect(result.current.request).toBe("two");
    act(() => result.current.onConfirm());
    await expect(second).resolves.toBe(true);
  });
});
```
changeset: .changeset/ui-panel-kit-promise-confirm.md: `"@jini-ai/ui": minor` | "`@jini-ai/ui/panel-kit` exports `usePromiseConfirm`, an awaitable confirmation for a host-rendered dialog."
jini_msg: "feat(ui): usePromiseConfirm in panel-kit"
Tovu edits (use-site-confirm.hooks.ts):
  - "import { useCallback, useRef, useState } from \"react\";" -> "import { usePromiseConfirm } from \"@jini-ai/ui/panel-kit\";"
  - replace the body of useSiteConfirm, from the line "  const [request, setRequest] = useState<{ message: string; action: ConfirmableSiteAction } | null>(null);" through the line "  }, []);" that closes `settle` (the second "  }, []);" in the function), with:
      "  const { confirm, request, onConfirm, onCancel } = usePromiseConfirm<{ message: string; action: ConfirmableSiteAction }>();"
  - "    onConfirm: () => settle(true),\n    onCancel: () => settle(false)," -> "    onConfirm,\n    onCancel,"
  - doc above useSiteConfirm: " * A second request while one is open cancels the first, so no caller is left awaiting forever." -> " * The awaitable core (a second request cancels the first) is `usePromiseConfirm` in `@jini-ai/ui/panel-kit`."
  Result: useSiteConfirm keeps the same returned shape { confirm, open, title, body, confirmLabel, tone, onConfirm, onCancel }.
tests: Tovu __tests__/site-card-view.unit.test.tsx (useSiteConfirm describe) and use-local-sites.unit.test.tsx: unchanged, they keep testing the binding. If either fails to type `confirm`'s call (`confirm({ message, action })`), SKIP.
tovu_msg: "refactor(admin-sites): site confirm builds on usePromiseConfirm from @jini-ai/ui/panel-kit"

## Slice UI-admin-sites-4 (T-UI, hook move): useSiteListPrefs into @jini-ai/ui/site-card
tovu_files:
  - apps/admin/src/features/sites/hooks/use-site-list-prefs.hooks.ts | blob 137bac57bfcf749403b657300e393a3db2bd1b05 | keep-reduced (rewrite to FILE_AFTER)
  - apps/admin/src/features/sites/Sites.tsx | blob 76347dc9b91bc64516fff4da09be50164e9de8f0
  - apps/admin/src/features/sites/__tests__/use-site-list-prefs.hooks.unit.test.tsx | blob 2d0d809bd3dfc242be8272e3b1d931863959a038 | relocate to Jini, then git rm
  - apps/admin/src/features/sites/__tests__/site-list-prefs.fixture.ts | blob bcb65aa7a9d7399991794c59784dd52dafe7f261 | edit import
split: SITE_LIST_KEY STAY-WIRING; SiteListPrefsPort MOVE; SiteListPrefsController MOVE; defaultSiteListPrefsPort STAY-WIRING; useSiteListPrefs MOVE (+ optional describeError); useWiredSiteListPrefs STAY-WIRING (binds describeApiError).
ports: describeError: (required: { error: unknown }) => string | Tovu binds `({ error }) => describeApiError({ e: error, fallback: String(error) })` in useWiredSiteListPrefs. Jini default: `error instanceof Error ? error.message : String(error)`.
jini guards: packages/ui/src/features/site-card/use-site-list-prefs.hooks.ts must not exist; `rg -n "useSiteListPrefs|SiteListPrefsPort|SiteListPrefsController" packages/ui/src` prints nothing; site-card/index.ts | blob 16f19d5973f346f8135ce2b95e7686e93287bd7f
jini_code (new file packages/ui/src/features/site-card/use-site-list-prefs.hooks.ts):
```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_SITE_LIST_PREFS, parseSiteListPrefs, type SiteListPrefs } from "./site-list-view.js";

/**
 * @file A site list's remembered choices (sort, pins, hidden sites), read once through a host port
 * and written back one change at a time. Where they are stored (a per-user settings ledger, a file)
 * is the host's choice.
 */

export interface SiteListPrefsPort {
  load(): Promise<unknown>;
  save(required: { next: SiteListPrefs }, optional?: Record<string, never>): Promise<void>;
}

export interface SiteListPrefsController {
  prefs: SiteListPrefs;
  /** False until the stored choices arrive, so the cards do not reorder under the person. */
  ready: boolean;
  onPrefsChange(next: SiteListPrefs): void;
  /** The reason the choices could not be read, or `null`. */
  loadError: string | null;
  /** The reason the last change could not be saved, or `null`. */
  saveError: string | null;
}

function defaultDescribeError({ error }: { error: unknown }): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Applies a change at once and saves it behind the previous save, so two quick clicks cannot land out
 * of order. After a failed read nothing is saved: the defaults on screen would overwrite the person's
 * real pins.
 * @returns The current choices and their save state. @complexity O(1) per change.
 */
export function useSiteListPrefs(
  { port }: { port: SiteListPrefsPort },
  { describeError = defaultDescribeError }: { describeError?: ((required: { error: unknown }) => string) | undefined } = {},
): SiteListPrefsController {
  const [prefs, setPrefs] = useState<SiteListPrefs>(DEFAULT_SITE_LIST_PREFS);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const lastSave = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let current = true;
    port.load().then(
      (stored) => { if (current) { setPrefs(parseSiteListPrefs({ stored })); setReady(true); } },
      (error: unknown) => { if (current) { setLoadError(describeError({ error })); setReady(true); } },
    );
    return () => { current = false; };
  }, [port, describeError]);

  const onPrefsChange = useCallback((next: SiteListPrefs) => {
    setPrefs(next);
    if (loadError !== null) return;
    lastSave.current = lastSave.current.then(() => port.save({ next })).then(
      () => setSaveError(null),
      (error: unknown) => setSaveError(describeError({ error })),
    );
  }, [port, loadError, describeError]);

  return { prefs, ready, onPrefsChange, loadError, saveError };
}
```
  STOP check before writing: `rg -n "export function parseSiteListPrefs" packages/ui/src/features/site-card/site-list-view.ts` must show the signature `({ stored }` (object arg); else SKIP.
jini_index (site-card/index.ts): append after the last line: "export { useSiteListPrefs, type SiteListPrefsController, type SiteListPrefsPort } from \"./use-site-list-prefs.hooks.js\";"
jini_tests: RELOCATE apps/admin/src/features/sites/__tests__/use-site-list-prefs.hooks.unit.test.tsx (all 4 cases, assertions verbatim) -> new file packages/ui/src/features/site-card/__tests__/use-site-list-prefs.hooks.unit.test.tsx. Import edits only:
  - "import { DEFAULT_SITE_LIST_PREFS } from \"@jini-ai/ui/site-card\";" -> "import { DEFAULT_SITE_LIST_PREFS } from \"../site-list-view.js\";"
  - "import { useSiteListPrefs, type SiteListPrefsPort } from \"../hooks/use-site-list-prefs.hooks\";" -> "import { useSiteListPrefs, type SiteListPrefsPort } from \"../use-site-list-prefs.hooks.js\";"
  (framework already vitest; `toContain("disk full")` / `toContain("offline")` hold with the default describeError.)
  Then `git rm -q` the Tovu test file in the Tovu commit.
changeset: .changeset/ui-site-card-list-prefs.md: `"@jini-ai/ui": minor` | "`@jini-ai/ui/site-card` exports `useSiteListPrefs`, the remembered sort/pins/hidden choices behind a host load/save port."
jini_msg: "feat(ui): useSiteListPrefs in site-card with an injected describeError"
FILE_AFTER (whole new apps/admin/src/features/sites/hooks/use-site-list-prefs.hooks.ts, ending with one newline):
```ts
/**
 * @file The Sites list's remembered choices (sort, pins, hidden sites), stored per person in the
 * server's `core.interface` settings namespace, the same per-user ledger as Settings → User
 * Interface, so they follow the person rather than the browser. The hook itself is `useSiteListPrefs`
 * in `@jini-ai/ui/site-card`; Tovu binds the ledger and its error wording here.
 *
 * Cost: one read of that namespace (about a dozen small keys) each time the Sites page opens, and one
 * single-row write of under 1 KB per click on Sort by, a pin or Hide. No polling.
 */
import { useSiteListPrefs, type SiteListPrefsController, type SiteListPrefsPort } from "@jini-ai/ui/site-card";
import { describeApiError } from "@/lib/api";
import { loadNamespaceValues, saveChangedEntries } from "@/lib/ledger-slice";
import { INTERFACE_NAMESPACE } from "@/lib/settings-tabs";

/** Registered by the server in `apps/website/src/features/settings/admin-interface.ts`. */
export const SITE_LIST_KEY = "sitesList";

export const defaultSiteListPrefsPort: SiteListPrefsPort = {
  load: async () => (await loadNamespaceValues({ namespace: INTERFACE_NAMESPACE })).get(SITE_LIST_KEY),
  save: async ({ next }, _optional = {}) => { await saveChangedEntries({ namespace: INTERFACE_NAMESPACE, scope: "user", candidates: [{ key: SITE_LIST_KEY, valueJson: next, changed: true }] }); },
};

const describeError = ({ error }: { error: unknown }): string => describeApiError({ e: error, fallback: String(error) });

/** The Sites page's list choices, bound to the per-user ledger. */
export function useWiredSiteListPrefs(): SiteListPrefsController {
  return useSiteListPrefs({ port: defaultSiteListPrefsPort }, { describeError });
}
```
  Before overwriting: copy the exact /** */ doc block that sits right above `export function useWiredSiteListPrefs` in the current file over the placeholder doc line "/** The Sites page's list choices, bound to the per-user ledger. */" (why-comments move with the code, COMMON rule 12).
Tovu edits:
  - Sites.tsx: "import { useWiredSiteListPrefs, type SiteListPrefsController } from \"./hooks/use-site-list-prefs.hooks\";" -> "import type { SiteListPrefsController } from \"@jini-ai/ui/site-card\";\nimport { useWiredSiteListPrefs } from \"./hooks/use-site-list-prefs.hooks\";"
census: python3 scripts/census.py <TOVU> apps/admin/src/features/sites/hooks/use-site-list-prefs.hooks.ts -> Sites.tsx:17, __tests__/use-site-list-prefs.hooks.unit.test.tsx:4, __tests__/site-list-prefs.fixture.ts:2 ; plus `rg -n "SiteListPrefsPort|useSiteListPrefs\b" apps/admin/src` after the edit: only FILE_AFTER lines. The census also lists __tests__/site-list-prefs.fixture.ts:2 (type import): edit it "import type { SiteListPrefsController } from \"../hooks/use-site-list-prefs.hooks\";" -> "import type { SiteListPrefsController } from \"@jini-ai/ui/site-card\";". Census before must be exactly those 3 lines.
tovu_msg: "refactor(admin-sites): the list-prefs hook comes from @jini-ai/ui/site-card" | body "Tovu keeps the ledger binding, SITE_LIST_KEY and describeApiError wording."
look: Sites page: change Sort by, pin a site, reload -> choices persist; stop the server mid-change -> the save error shows the server's reason.

## Executor notes for the whole feature
- Jini commits: slices 2, 3, 4 (one each, with its changeset). Tovu commits: 1, 2, 3, 4.
- est. executor tokens: ~25k (slice 1) + ~40k + ~40k + ~45k Sonnet = ~150k total, run as 4 jobs.

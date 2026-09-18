/**
 * @file Wiring guard for `useWebviewLoadFailure` — D-03, where a correct recovery primitive was
 * bound to the wrong lifetime and so observed the one path that needed it least.
 *
 * Source text, for the reason `rescan-wiring.test.ts` states at length: `apps/desktop`'s test
 * script runs this file itself under `node --import tsx --test`, which transpiles but supplies no
 * DOM, so a `.tsx` component still cannot be rendered here, and `npm run typecheck` cannot see a
 * lifetime bug either — every shape here type-checks perfectly, which is exactly why the defect
 * survived.
 *
 * What went wrong, so a future reader can tell whether a change to this file is a fix or a
 * regression: the effect's deps were `[webviewRef, resetKey]`, and it returned early when
 * `webviewRef.current === null`. `SiteWorkspace` renders the `<webview>` only when
 * `running && !failed`. A ref OBJECT is stable for the component's whole life, so on the two
 * ordinary paths that mount a guest — a stopped tab whose poll flips to `running`, and the failure
 * panel's own retry — neither dep changed, the effect never re-ran, and no `did-fail-load`
 * listener and no stall timer were ever installed on the node actually on screen. Only "Reload
 * while healthy" (where `key` remounts the guest in the same commit the effect follows) ever
 * attached them.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const read = (...parts: string[]) => fs.readFileSync(path.join(__dirname, ...parts), "utf8");
const appHooks = read("App.hooks.ts");
const appTsx = read("App.tsx");

/** `useWebviewLoadFailure`'s body, up to the next top-level `export function`. */
function hookBody() {
  const start = appHooks.indexOf("export function useWebviewLoadFailure(");
  assert.notEqual(start, -1, "useWebviewLoadFailure must still exist in App.hooks.ts");
  const rest = appHooks.slice(start + 1);
  const end = rest.indexOf("\nexport function ");
  return rest.slice(0, end === -1 ? undefined : end);
}

test("the listeners are keyed on the guest NODE, so their lifetime is the node's", () => {
  const body = hookBody();
  assert.match(body, /addEventListener\('did-fail-load'/, "the hook must still install the failure listener");
  // The node arrives through state set by a callback ref, which is what makes it a dependency that
  // actually CHANGES when the element mounts. A `RefObject` cannot: it is the same object forever.
  assert.match(body, /useState<HTMLWebViewElement \| null>\(null\)/, "the guest node must be held in state, not a ref object");
  assert.doesNotMatch(body, /\[webviewRef, resetKey\]/, "D-03: a ref object never changes, so this effect never re-ran when the guest mounted");
});

test("the hook hands back the callback ref, and App.tsx puts it on the guest", () => {
  assert.match(hookBody(), /guestRef/, "the hook must expose the callback ref that captures the node");
  // `combinedGuestRef` is `useComposedGuestRef(guestRef, …)` — the hook's own callback ref, wrapped
  // so ONE `ref` also feeds the find bar's and zoom's per-guest registries. Both halves are pinned:
  // a `combinedGuestRef` that stopped composing `guestRef` would silently retire D-03.
  assert.match(appTsx, /<webview\s+ref=\{combinedGuestRef\}/, "the guest must be attached through a ref composed from the hook's own callback ref");
  assert.match(appTsx, /useComposedGuestRef\(guestRef,/, "the composed ref must still be built from the hook's own callback ref");
  assert.doesNotMatch(appTsx, /useRef<HTMLWebViewElement>\(null\)/, "the stale ref object must be gone, not left alongside");
});

test("clearing the failure is a SEPARATE effect keyed on resetKey alone", () => {
  // The trap a naive node-keyed rewrite falls into. The old single effect reset `failed`/`stalled`
  // on every run. Key that same effect on the node and unmounting the guest — which is what
  // `failed` DOES, since `running && !failed` swaps it for the recovery panel — re-runs it with a
  // null node and clears the very flag that unmounted it. The guest remounts, fails again, and the
  // panel flickers forever. The reset must fire only when the operator asks for a fresh judgment.
  assert.match(
    hookBody(),
    /setFailed\(false\);\s*\n\s*setStalled\(false\);\s*\n\s*\}, \[resetKey\]\);/,
    "the reset must be its own effect depending on resetKey ONLY",
  );
});

/**
 * D-02 lives in the same renderer and has the same lack of a runner, so its wiring guard goes here
 * rather than in a third one-test file.
 */
const onboarding = read("CreateWebsiteOnboarding.tsx");

test("the two database options this app cannot provision are DISABLED, with the reason on the card", () => {
  // D-02. Both were selectable, and `computeCanCreate` then refused to enable the button until the
  // operator typed a project URL and an API key — which `handleCreate` discarded before reporting
  // a plain SQLite site as success. Being made to type a credential that is thrown away is worse
  // than the choice being ignored. A disabled option cannot be selected, so the vendor field blocks
  // (`database === 'supabase' && ...`) never render and no credential is ever asked for.
  const picker = onboarding.slice(onboarding.indexOf("function DatabasePicker("));
  for (const value of ["supabase", "custom"]) {
    const option = picker.slice(picker.indexOf(`value="${value}"`));
    assert.match(option.slice(0, option.indexOf("/>")), /unavailable/, `the ${value} option must be marked unavailable`);
  }
  const sqlite = picker.slice(picker.indexOf('value="sqlite"'));
  assert.doesNotMatch(sqlite.slice(0, sqlite.indexOf("/>")), /unavailable/, "SQLite is the one this app really does create");
});

test("an unavailable option really disables its radio, not just its styling", () => {
  const start = onboarding.indexOf("function DatabaseOption(");
  const body = onboarding.slice(start, onboarding.indexOf("function DatabasePicker(", start));
  assert.match(body, /disabled=\{unavailable\}/, "a control that only LOOKS disabled is still selectable by keyboard");
});

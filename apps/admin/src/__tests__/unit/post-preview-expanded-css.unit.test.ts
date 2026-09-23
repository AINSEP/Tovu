import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * @file Regression coverage for the expanded post-preview's flex chain (`a380c716`).
 *
 * **The symptom this file exists to prevent is an empty white panel.** Expanding a post's Preview
 * renders the site header over roughly nothing: the iframe collapses to its intrinsic ~150px inside
 * a full-height panel. That is what shipped before `a380c716` added
 * `.post-preview-expanded .editor-shell { display: flex; flex-direction: column }`.
 *
 * The expanded device frame takes its height from `flex: 1`, which only resolves against a flex
 * parent that itself has a resolved height. So the height is handed down an unbroken chain of four
 * rules, root to leaf, and deleting ANY link silently collapses the preview (the iframe itself fills
 * the frame's scaler, whose `calc(100% / scale)` height `devicePreviewFrameStyles` writes inline):
 *
 *   `.post-preview-expanded`                     flex column, `position: absolute; inset: 0`
 *     -> `.post-preview-surface`                 flex column, `flex: 1; min-height: 0`
 *       -> `.editor-shell`                       flex column, `flex: 1; min-height: 0`
 *         -> `.page-preview-frame`               `flex: 1; min-height: 0` (no inline height expanded)
 *
 * `.editor-shell` is the fragile link — it is a SHARED class (`styles.css:2017`) that is not a flex
 * column anywhere else in the admin, so the override exists only here and reads like an orphan to
 * anyone tidying this file.
 *
 * Asserted as CSS text, not through a rendered component, for the same reason
 * `narrow-content-column-css.unit.test.ts` and `sidebar-accordion-css.unit.test.ts` do: jsdom runs no
 * layout, so `flex` resolves to nothing there and a component test would pass just as happily with
 * the whole chain deleted. `process.cwd()`-relative, not `import.meta.url`-relative — this package's
 * Vitest transform does not give test modules a plain `file://` `import.meta.url` (confirmed
 * empirically; `new URL(..., import.meta.url)` throws "The URL must be of scheme file" here), so the
 * only stable anchor is the package root Vitest is invoked from. Run this suite from inside
 * `apps/admin`; invoking Vitest from the repo root with `--root`/`--prefix` makes the read ENOENT.
 */
const stylesheet = readFileSync(resolve(process.cwd(), "src/styles/editor.css"), "utf8");

/**
 * Every declaration block whose selector list is EXACTLY `selector`, concatenated.
 *
 * Concatenated rather than first-match (`/re/.exec(...)?.[0]`, the pattern the sibling CSS suites
 * use) because this feature deliberately splits some of its rules across two blocks —
 * `.post-preview-surface` declares its flex behavior in one and its `margin-top` in another, next to
 * the override that zeroes it. A first-match helper would quietly assert against whichever block
 * happens to come first and report a missing declaration the moment someone reorders them.
 */
function declarationsFor(selector: string): string {
  // Anchored at line start (`m` flag), which is what distinguishes `.post-preview-surface` from
  // `.post-preview-expanded .post-preview-surface` and from `.post-preview-fab:hover` — this
  // stylesheet writes one rule per line with the selector in column 0. Throwing on no match turns a
  // renamed or mistyped selector into that error instead of a bare "expected '' to match /.../".
  const pattern = new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "gm");
  const bodies = [...stylesheet.matchAll(pattern)].map((match) => match[1]);
  if (bodies.length === 0) throw new Error(`No rule for selector "${selector}" in src/styles/editor.css`);
  return bodies.join(";");
}

describe("expanded post-preview flex chain (an empty white panel is the symptom of breaking it)", () => {
  // The link `a380c716` actually added. Delete this one declaration and the expanded panel renders
  // the site header over a ~150px iframe in an otherwise empty white box.
  it("makes .editor-shell a flex column while expanded — the shared class is not one by default", () => {
    const rule = declarationsFor(".post-preview-expanded .editor-shell");
    expect(rule).toMatch(/display\s*:\s*flex/);
    expect(rule).toMatch(/flex-direction\s*:\s*column/);
  });

  it("gives that .editor-shell a resolved height to divide up (flex: 1; min-height: 0)", () => {
    const rule = declarationsFor(".post-preview-expanded .editor-shell");
    expect(rule).toMatch(/flex\s*:\s*1/);
    // Without `min-height: 0` a flex item's `auto` minimum floors it at its content height, so the
    // iframe cannot shrink to fit and the panel scrolls instead of filling.
    expect(rule).toMatch(/min-height\s*:\s*0/);
  });

  it("makes .post-preview-surface a flex column so it can pass height down to .editor-shell", () => {
    const rule = declarationsFor(".post-preview-surface");
    expect(rule).toMatch(/display\s*:\s*flex/);
    expect(rule).toMatch(/flex-direction\s*:\s*column/);
  });

  it("gives .post-preview-surface its own resolved height while expanded", () => {
    const rule = declarationsFor(".post-preview-expanded .post-preview-surface");
    expect(rule).toMatch(/flex\s*:\s*1/);
    expect(rule).toMatch(/min-height\s*:\s*0/);
  });

  it("makes .post-preview-expanded itself the flex column the whole chain hangs from", () => {
    const rule = declarationsFor(".post-preview-expanded");
    expect(rule).toMatch(/display\s*:\s*flex/);
    expect(rule).toMatch(/flex-direction\s*:\s*column/);
  });

  it("lets the expanded device frame grow to fill .editor-shell (2026-09-22 device-width preview)", () => {
    const rule = declarationsFor(".post-preview-expanded .page-preview-frame");
    expect(rule).toMatch(/flex\s*:\s*1/);
    expect(rule).toMatch(/min-height\s*:\s*0/);
  });
});

/**
 * The fullscreen control's own positioning contract. `PostEditor.unit.test.tsx`'s "Preview
 * fullscreen" suite pins the DOM half (the control nests inside `.post-preview-surface` in both
 * states); this pins the CSS half. Both halves are needed: `position: absolute` resolves against the
 * nearest positioned ancestor, so either the nesting changing or `position: relative` leaving this
 * rule parks the icon against some far outer box — visible only on screen, never in jsdom.
 */
describe("preview fullscreen control positioning", () => {
  it("keeps .post-preview-surface positioned, as the fab's containing block", () => {
    expect(declarationsFor(".post-preview-surface")).toMatch(/position\s*:\s*relative/);
  });

  it("positions .post-preview-fab absolutely against it, above the preview's own content", () => {
    const rule = declarationsFor(".post-preview-fab");
    expect(rule).toMatch(/position\s*:\s*absolute/);
    expect(rule).toMatch(/z-index\s*:\s*[1-9]/);
  });
});

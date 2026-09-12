import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { executePageCapability } from "@jini-ai/agentic/core";
import { createDomPageDriver } from "@jini-ai/agentic/dom";

import { ThemeExplore } from "../ThemeExplore";
import type { ThemeExploreController, ThemeExploreFile } from "../hooks/use-theme-explore.hooks";

/**
 * @file `ThemeExplore` (the Explore screen, `ThemeExplore.tsx`) had no test file at all before this
 * pass (2026-08-11) — the 42 tests that already lived under this directory cover `Themes.tsx` (the
 * theme LIST screen) and `rules.ts`, neither of which this component is. Driven through the
 * `useThemeExploreHook` DI seam, the same convention `Themes.unit.test.tsx` and
 * `PageEditor.unit.test.tsx` use for their own screens.
 *
 * Two things this pass specifically pins down (2026-08-11 owner feedback on the Explore screen):
 * - Partials now preview standalone (`/theme-explore/{theme}/partial/{id}`) instead of showing "no
 *   standalone preview" — a partial is complete, styled markup the moment its CSS loads.
 * - The Preview pane has a Desktop/Tablet/Mobile width control (reusing `PageEditor.tsx`'s own
 *   `PAGE_PREVIEW_WIDTHS`) plus a fullscreen affordance, keyboard-dismissible via Escape.
 */

const FILES: ThemeExploreFile[] = [
  // `null`, but NOT "no control at all" — `index` is never its own reachable page
  // (`NON_ROUTABLE_THEME_PAGE_IDS`, `theme.ts`), so it shows a LOCKED, disabled switch (always ON,
  // with a reason) rather than nothing — see the "publish toggle" describe block below.
  // `modified: true` on exactly `index`, `about` and `styles.css` — the three files whose bytes differ
  // from their catalog original, so the only ones that get a Reset button and a modified marker. Every
  // other resettable file is `modified: false`; every non-resettable one is `modified: null`.
  { path: "pages/index.html", label: "index", kind: "page", readable: true, editable: true, resettable: true, modified: true, published: null, collidingContent: null },
  // Same shape as `index` above — the OTHER non-routable id, and the exact case that cost real
  // operator confusion before this: the owner selected `404`, saw no control at all, and concluded
  // the publish feature hadn't shipped.
  { path: "pages/404.html", label: "404", kind: "page", readable: true, editable: true, resettable: true, modified: false, published: null, collidingContent: null },
  // A declared Post/Page template shell (`ThemeManifest.templates`) — the THIRD non-candidate shape,
  // and the one with no independent public route at all, so its locked switch shows OFF rather than
  // ON (unlike `index`/`404` above) — see `lockedPublishReason`'s own doc for why.
  { path: "pages/blog-post.html", label: "blog-post", kind: "page", readable: true, editable: true, resettable: true, modified: false, published: null, collidingContent: null },
  // A real candidate page, currently PUBLISHED — see the "publish toggle" describe block below.
  { path: "pages/about.html", label: "about", kind: "page", readable: true, editable: true, resettable: true, modified: true, published: true, collidingContent: null },
  { path: "nav.html", label: "nav", kind: "partial", readable: true, editable: true, resettable: true, modified: false, published: null, collidingContent: null },
  { path: "footer.html", label: "footer", kind: "partial", readable: true, editable: true, resettable: true, modified: false, published: null, collidingContent: null },
  { path: "css/styles.css", label: "styles.css", kind: "style", readable: true, editable: true, resettable: true, modified: true, published: null, collidingContent: null },
  // Editable (2026-08-29 owner ask, reversing the 2026-08-11 one recorded in this fixture's own git
  // history: "we need the ability to edit CSS and JS for the themes"). Still `IDENTITY_LOCKED_GROUPS`
  // for rename/delete — see the "per-file overflow menu" describe block below.
  { path: "js/main.js", label: "main.js", kind: "script", readable: true, editable: true, resettable: true, modified: false, published: null, collidingContent: null },
  // The `other` catch-all group — also read-only-to-edit, but for a different reason (never asked to
  // be edited here at all, not "the owner doesn't want it edited").
  { path: "NOTICE.md", label: "NOTICE.md", kind: "other", readable: true, editable: false, resettable: false, modified: null, published: null, collidingContent: null },
  // Binary + author-added: the two cases that must NOT offer an editor or a Reset respectively.
  { path: "screenshots/index.png", label: "index.png", kind: "asset", readable: false, editable: false, resettable: true, modified: false, published: null, collidingContent: null },
  // A real candidate page, currently OFF — the other half of the "publish toggle" describe block below.
  { path: "pages/mine.html", label: "mine", kind: "page", readable: true, editable: true, resettable: false, modified: null, published: false, collidingContent: null },
  // A templated-tier Liquid source file — `other` group (no `templates/` case in `fileGroup`), but
  // readable (2026-08-12, `TEXT_READABLE_EXTENSIONS`) and, unlike `NOTICE.md` below, gets its own
  // real rendered preview — see the "preview src — pages, partials, and templates" describe block.
  { path: "templates/home.liquid", label: "home.liquid", kind: "other", readable: true, editable: false, resettable: true, modified: false, published: null, collidingContent: null },
];

function controller(overrides: Partial<ThemeExploreController> = {}): ThemeExploreController {
  return {
    detail: {
      id: "novice",
      name: "Novice",
      tier: "static",
      apiVersion: undefined,
      status: "valid",
      errors: [],
      lineage: null,
      hasOriginal: true,
    },
    files: FILES,
    selected: "pages/index.html",
    select: vi.fn(),
    view: "preview",
    setView: vi.fn(),
    source: "<p>hi</p>",
    setSource: vi.fn(),
    dirty: false,
    saving: false,
    error: null,
    dismissError: vi.fn(),
    notice: null,
    dismissNotice: vi.fn(),
    save: vi.fn(),
    resetting: false,
    resetConfirmOpen: false,
    openResetConfirm: vi.fn(),
    closeResetConfirm: vi.fn(),
    reset: vi.fn(),
    previewNonce: 0,
    renamingPath: null,
    renameDraft: "",
    setRenameDraft: vi.fn(),
    startRename: vi.fn(),
    cancelRename: vi.fn(),
    commitRename: vi.fn(),
    renaming: false,
    pageRenameWarning: null,
    confirmPageRename: vi.fn(),
    cancelPageRenameWarning: vi.fn(),
    copyingPath: null,
    copyFile: vi.fn(),
    deleteTarget: null,
    openDeleteConfirm: vi.fn(),
    closeDeleteConfirm: vi.fn(),
    deleting: false,
    confirmDelete: vi.fn(),
    publishing: false,
    setPagePublished: vi.fn(),
    // Identity `t` — matches what this screen got from a real, unmocked `useAdminLocale()` call
    // before this hook's own i18n pass (defaults to "en", and THEMES_DICT has no "en" entries, so
    // every lookup already fell through to `?? key`), so every existing literal-English-string
    // assertion below stays valid unchanged.
    t: (key: string) => key,
    ...overrides,
  };
}

function renderExplore(overrides: Partial<ThemeExploreController> = {}) {
  const ctrl = controller(overrides);
  const useThemeExploreHook = () => ctrl;
  const utils = render(<ThemeExplore themeId="novice" useThemeExploreHook={useThemeExploreHook} />);
  return { ctrl, ...utils };
}

describe("preview src — pages, partials, and templates", () => {
  it("points a selected PAGE's preview at /theme-explore/{theme}/{pageId}", () => {
    renderExplore({ selected: "pages/about.html" });
    const iframe = screen.getByTitle("Theme preview") as HTMLIFrameElement;
    expect(iframe.src).toContain("/theme-explore/novice/about");
    expect(iframe.src).not.toContain("/partial/");
  });

  it("points a selected PARTIAL's preview at /theme-explore/{theme}/partial/{partialId} — regression for 'Partials have no standalone preview'", () => {
    renderExplore({ selected: "nav.html" });
    const iframe = screen.getByTitle("Theme preview") as HTMLIFrameElement;
    expect(iframe.src).toContain("/theme-explore/novice/partial/nav");
    expect(screen.queryByText(/no standalone preview/i)).not.toBeInTheDocument();
  });

  it("carries previewNonce through for a partial the same way it does for a page (cache-busting reload after Save)", () => {
    renderExplore({ selected: "footer.html", previewNonce: 3 });
    const iframe = screen.getByTitle("Theme preview") as HTMLIFrameElement;
    expect(iframe.src).toContain("/theme-explore/novice/partial/footer");
    expect(iframe.src).toContain("v=3");
  });

  /**
   * Not previously covered at all (found during the 2026-08-11 function-quality self-check on
   * `previewSrcFor`): the asset-serving branch was gated on `kind === "asset" && !editable` before
   * the readable/editable split, then broadened to `!readable` alone so an unrecognized-extension
   * binary landing in the new `other` group also gets served — but nothing asserted either shape.
   */
  it("points a non-readable ASSET's preview at the raw /theme-assets/ URL", () => {
    renderExplore({ selected: "screenshots/index.png" });
    const iframe = screen.getByTitle("Theme preview") as HTMLIFrameElement;
    expect(iframe.src).toContain("/theme-assets/novice/screenshots/index.png");
  });

  it("points a non-readable OTHER-group file's preview at the same raw URL — the broadened case, not just assets", () => {
    renderExplore({
      files: [...FILES, { path: "vendor.bin", label: "vendor.bin", kind: "other", readable: false, editable: false, resettable: false, modified: null, published: null, collidingContent: null }],
      selected: "vendor.bin",
    });
    const iframe = screen.getByTitle("Theme preview") as HTMLIFrameElement;
    expect(iframe.src).toContain("/theme-assets/novice/vendor.bin");
  });

  /**
   * 2026-08-17 owner ask (verbatim): "Can we get preview to just render everything, in a simple
   * manner. If it's an image, it renders that. If it's a JavaScript, it just renders like HTML. If
   * it's JSON same." Before this fix, `previewSrcFor` gated the raw-asset fallback on `!file.readable`
   * — but `style`/`script`/`config` files ARE `readable: true`, so a CSS/JS/JSON selection returned
   * `null` and Preview showed nothing but "Select a file to preview." Regression: these are readable
   * files that must now still resolve to a real preview URL, not fall into the null branch.
   */
  it("points a readable STYLE (CSS) file's preview at the raw /theme-assets/ URL, not null", () => {
    renderExplore({ selected: "css/styles.css" });
    const iframe = screen.getByTitle("Theme preview") as HTMLIFrameElement;
    expect(iframe.src).toContain("/theme-assets/novice/css/styles.css");
    expect(screen.queryByText(/select a file to preview/i)).not.toBeInTheDocument();
  });

  it("points a readable SCRIPT (JS) file's preview at the raw /theme-assets/ URL, not null", () => {
    renderExplore({ selected: "js/main.js" });
    const iframe = screen.getByTitle("Theme preview") as HTMLIFrameElement;
    expect(iframe.src).toContain("/theme-assets/novice/js/main.js");
    expect(screen.queryByText(/select a file to preview/i)).not.toBeInTheDocument();
  });

  it("points a readable CONFIG (JSON) file's preview at the raw /theme-assets/ URL, not null", () => {
    renderExplore({
      files: [...FILES, { path: "theme.json", label: "theme.json", kind: "config", readable: true, editable: true, resettable: true, modified: false, published: null, collidingContent: null }],
      selected: "theme.json",
    });
    const iframe = screen.getByTitle("Theme preview") as HTMLIFrameElement;
    expect(iframe.src).toContain("/theme-assets/novice/theme.json");
    expect(screen.queryByText(/select a file to preview/i)).not.toBeInTheDocument();
  });

  /**
   * Owner-reported (2026-08-12): "I still don't see a preview of the liquid with the styles at
   * all." At the time, a `.liquid` template was `readable` (see the FILES fixture above) but not
   * `kind === "page"`/`"partial"`, so `previewSrcFor` returned `null` and the Preview tab fell
   * through to the same generic "Select a file to preview." copy shown for a totally different
   * situation. ~70 minutes later the same day, `2a7cb56` (server: `theme-page-preview.ts`'s
   * `/theme-explore/{theme}/template/{templateId}` route, backed by the same `renderSite`/
   * `renderLiquidInSandbox` pipeline the live public site renders through) and `89fabb9` (client:
   * `previewSrcFor` wired to it) gave `.liquid` files a real preview, same as a page or partial —
   * this test now pins that down instead of the honest-gap message that preceded it.
   */
  it("points a selected .liquid TEMPLATE's preview at /theme-explore/{theme}/template/{templateId}, not the generic notice", () => {
    renderExplore({ selected: "templates/home.liquid" });
    const iframe = screen.getByTitle("Theme preview") as HTMLIFrameElement;
    // Pins the exact templateId boundary via the query-string delimiter — "home" alone would also
    // match the unstripped "home.liquid" (a leading-substring false pass), so the assertion checks
    // for "home?v=" specifically, matching `previewSrcFor`'s `?v=${previewNonce}` (default nonce 0).
    expect(iframe.src).toContain("/theme-explore/novice/template/home?v=0");
    expect(screen.queryByText(/select a file to preview/i)).not.toBeInTheDocument();
  });
});

/**
 * 2026-08-17: `previewSrcFor` now returns a real raw-asset URL for every file kind — the only
 * remaining `previewSrc === null` case is nothing selected at all. An ordinary `other`-group file
 * like `NOTICE.md` used to fall into this generic message too; it now gets a real preview URL like
 * everything else (see the "preview src — pages, partials, and templates" describe block above).
 */
describe("preview notice — generic 'select a file' message", () => {
  it("points an ordinary readable other-group file's (e.g. NOTICE.md) preview at the raw URL, not the generic notice", () => {
    renderExplore({ view: "preview", selected: "NOTICE.md" });
    const iframe = screen.getByTitle("Theme preview") as HTMLIFrameElement;
    expect(iframe.src).toContain("/theme-assets/novice/NOTICE.md");
    expect(screen.queryByText(/select a file to preview/i)).not.toBeInTheDocument();
  });

  it("keeps the generic message when nothing is selected", () => {
    renderExplore({ view: "preview", selected: null });
    expect(screen.getByText(/^select a file to preview\.?$/i)).toBeInTheDocument();
  });
});

describe("device width control", () => {
  it("shows the Desktop/Tablet/Mobile group in preview view", () => {
    renderExplore({ view: "preview" });
    expect(screen.getByRole("group", { name: /preview width/i })).toBeInTheDocument();
  });

  it("hides the device control in html view", () => {
    renderExplore({ view: "html" });
    expect(screen.queryByRole("group", { name: /preview width/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /view preview fullscreen/i })).not.toBeInTheDocument();
  });

  it("defaults to Desktop pressed and shows its pixel width, matching PAGE_PREVIEW_WIDTHS.desktop", () => {
    renderExplore({ view: "preview" });
    expect(screen.getByRole("button", { name: "Desktop" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1280px")).toBeInTheDocument();
  });

  it("clicking Tablet presses Tablet, un-presses Desktop, and updates the width readout", async () => {
    const user = userEvent.setup();
    renderExplore({ view: "preview" });
    await user.click(screen.getByRole("button", { name: "Tablet" }));
    expect(screen.getByRole("button", { name: "Tablet" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Desktop" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("834px")).toBeInTheDocument();
  });

  it("clicking Mobile updates the readout to PAGE_PREVIEW_WIDTHS.mobile", async () => {
    const user = userEvent.setup();
    renderExplore({ view: "preview" });
    await user.click(screen.getByRole("button", { name: "Mobile" }));
    expect(screen.getByText("390px")).toBeInTheDocument();
  });
});

describe("fullscreen preview", () => {
  it("has no open attribute before the trigger is clicked", () => {
    renderExplore({ view: "preview" });
    const dialog = document.querySelector("dialog.theme-explore-preview-dialog")!;
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("opens the dialog when the fullscreen trigger is clicked", async () => {
    const user = userEvent.setup();
    renderExplore({ view: "preview" });
    await user.click(screen.getByRole("button", { name: /view preview fullscreen/i }));
    const dialog = document.querySelector("dialog.theme-explore-preview-dialog")!;
    expect(dialog.hasAttribute("open")).toBe(true);
  });

  it("closes on the dialog's native cancel event (Escape) and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    renderExplore({ view: "preview" });
    const trigger = screen.getByRole("button", { name: /view preview fullscreen/i });
    await user.click(trigger);

    const dialog = document.querySelector("dialog.theme-explore-preview-dialog")!;
    const cancelEvent = new Event("cancel", { cancelable: true });
    fireEvent(dialog, cancelEvent);

    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(trigger).toHaveFocus();
  });

  it("closes on a click on the dialog's own backdrop area (not a click on its content)", async () => {
    const user = userEvent.setup();
    renderExplore({ view: "preview" });
    await user.click(screen.getByRole("button", { name: /view preview fullscreen/i }));

    const dialog = document.querySelector("dialog.theme-explore-preview-dialog")!;
    fireEvent.click(dialog);
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("closes via its own close button and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    renderExplore({ view: "preview" });
    const trigger = screen.getByRole("button", { name: /view preview fullscreen/i });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: /close fullscreen preview/i }));

    const dialog = document.querySelector("dialog.theme-explore-preview-dialog")!;
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(trigger).toHaveFocus();
  });

  it("disables the fullscreen trigger when there is nothing selected to preview", () => {
    renderExplore({ view: "preview", selected: null });
    expect(screen.getByRole("button", { name: /view preview fullscreen/i })).toBeDisabled();
  });
});

/**
 * Assets, CSS, and Reset (2026-08-11 owner asks). The file list used to show ONLY pages and
 * partials, which hid every file an author changes to make a downloaded theme theirs.
 */
describe("file list beyond pages and partials", () => {
  it("groups styles, scripts and assets alongside pages and partials", () => {
    render(<ThemeExplore themeId="novice" useThemeExploreHook={() => controller()} />);
    const list = screen.getByRole("navigation", { name: "Theme files" });
    for (const heading of ["Pages", "Partials", "Styles", "Scripts", "Assets"]) {
      expect(within(list).getByText(heading)).toBeInTheDocument();
    }
    // Non-page/partial entries keep their extension — `styles` vs `styles.css` is the distinction
    // an author needs in a Styles list.
    expect(within(list).getByRole("button", { name: "styles.css" })).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "main.js" })).toBeInTheDocument();
  });

  it("refuses to put a binary file in the editor, offering the preview instead", () => {
    render(
      <ThemeExplore
        themeId="novice"
        useThemeExploreHook={() => controller({ selected: "screenshots/index.png", view: "html" })}
      />
    );
    // A textarea here would show mojibake, and saving it back would corrupt the file.
    expect(screen.queryByRole("textbox", { name: "Theme file source" })).not.toBeInTheDocument();
    expect(screen.getByText(/binary file/i)).toBeInTheDocument();
  });
});

describe("reset to original", () => {
  it("asks before resetting, and does not reset on the click that opens the prompt", async () => {
    const user = userEvent.setup();
    const openResetConfirm = vi.fn();
    const reset = vi.fn();
    render(
      <ThemeExplore
        themeId="novice"
        useThemeExploreHook={() => controller({ openResetConfirm, reset })}
      />
    );
    // "Reset index" — filename-qualified (2026-08-11 toolbar restructure), not bare "Reset"; see
    // the "toolbar buttons are bound to the file" describe block below for the dedicated coverage.
    await user.click(screen.getByRole("button", { name: "Reset index" }));
    expect(openResetConfirm).toHaveBeenCalledTimes(1);
    // The whole point of the confirmation: the destructive call has NOT happened yet.
    expect(reset).not.toHaveBeenCalled();
  });

  it("warns that work will be lost, and names the exact file", () => {
    render(
      <ThemeExplore
        themeId="novice"
        useThemeExploreHook={() => controller({ resetConfirmOpen: true, selected: "pages/about.html" })}
      />
    );
    expect(screen.getByText(/will be lost/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    // Named explicitly rather than "this file" — the prompt must never be ambiguous about its target.
    expect(screen.getByText("pages/about.html")).toBeInTheDocument();
  });

  it("offers no Reset for a file the author added, which has no original to restore", () => {
    render(
      <ThemeExplore
        themeId="novice"
        useThemeExploreHook={() => controller({ selected: "pages/mine.html" })}
      />
    );
    // Absent rather than disabled: a greyed-out Reset invites "why can't I?", absence just means
    // the option does not apply.
    expect(screen.queryByRole("button", { name: /^reset/i })).not.toBeInTheDocument();
  });

  it("offers no Reset for a resettable file whose bytes still match its original", () => {
    render(
      <ThemeExplore
        themeId="novice"
        useThemeExploreHook={() => controller({ selected: "nav.html" })}
      />
    );
    // `nav.html` has a catalog original (`resettable: true`) but `modified: false`: a reset would
    // change nothing, so the button is absent for the same reason it is for an author-added file.
    expect(screen.queryByRole("button", { name: /^reset/i })).not.toBeInTheDocument();
  });

  it("marks exactly the modified files in the file list, with a tooltip saying why", () => {
    render(<ThemeExplore themeId="novice" useThemeExploreHook={() => controller()} />);
    const list = screen.getByRole("navigation", { name: "Theme files" });
    expect(within(list).getAllByRole("img", { name: "Modified" })).toHaveLength(3);
    for (const label of ["index", "about", "styles.css"]) {
      const row = within(list).getByRole("button", { name: label }).closest("li") as HTMLElement;
      expect(within(row).getByRole("img", { name: "Modified" })).toHaveAttribute("title", "Modified from the original");
    }
    // Resettable-but-identical (`nav`) and no-original-at-all (`mine`): neither is marked.
    for (const label of ["nav", "mine"]) {
      const row = within(list).getByRole("button", { name: label }).closest("li") as HTMLElement;
      expect(within(row).queryByRole("img", { name: "Modified" })).not.toBeInTheDocument();
    }
  });
});

/**
 * `other` read-only (2026-08-11 owner ask, for the catch-all group specifically). Scripts used to
 * share this same read-only-to-edit treatment, but 2026-08-29 (owner ask: "we need the ability to
 * edit CSS and JS for the themes") reversed that for `script` specifically — see the "editable" test
 * below for the new expectation, and the "per-file overflow menu" describe block further down for why
 * script's NAME/EXISTENCE (rename/delete) is still locked even though its content is not.
 */
describe("read-only groups (other)", () => {
  it("shows an 'other'-group file (e.g. NOTICE.md) in a read-only viewer, with a generic reason", () => {
    render(
      <ThemeExplore
        themeId="novice"
        useThemeExploreHook={() => controller({ selected: "NOTICE.md", view: "html" })}
      />
    );
    expect(screen.queryByText(/binary file/i)).not.toBeInTheDocument();
    expect(screen.getByText(/read-only in explore/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Theme file source (read-only)")).toHaveAttribute("readonly");
  });

  it("hides the Save button entirely for a read-only file — not just disabled", () => {
    render(
      <ThemeExplore
        themeId="novice"
        useThemeExploreHook={() => controller({ selected: "NOTICE.md", view: "html" })}
      />
    );
    expect(screen.queryByRole("button", { name: /^save/i })).not.toBeInTheDocument();
  });

  it("still shows the Save button for an editable file", () => {
    render(
      <ThemeExplore
        themeId="novice"
        useThemeExploreHook={() => controller({ selected: "pages/about.html", view: "html" })}
      />
    );
    expect(screen.getByRole("button", { name: /saved|save/i })).toBeInTheDocument();
  });
});

/**
 * Regression for the 2026-08-29 reversal: a script now renders through the SAME editable path an
 * ordinary page does — a plain textarea with an `onChange`, no read-only notice, and a Save button.
 * This is exactly what the OLD "shows a script's source in a read-only viewer..." test (removed here)
 * used to assert the OPPOSITE of; that assertion would now fail against the current controller/UI.
 */
describe("scripts are editable (2026-08-29)", () => {
  it("shows a script's source in an editable textarea, not the read-only viewer", () => {
    render(
      <ThemeExplore
        themeId="novice"
        useThemeExploreHook={() => controller({ selected: "js/main.js", view: "html" })}
      />
    );
    expect(screen.queryByText(/binary file/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/read-only in explore/i)).not.toBeInTheDocument();
    const textarea = screen.getByLabelText("Theme file source") as HTMLTextAreaElement;
    expect(textarea).not.toHaveAttribute("readonly");
  });

  it("shows the Save button for a script, same as any other editable file", () => {
    render(
      <ThemeExplore
        themeId="novice"
        useThemeExploreHook={() => controller({ selected: "js/main.js", view: "html", dirty: true })}
      />
    );
    expect(screen.getByRole("button", { name: /save main\.js/i })).toBeInTheDocument();
  });
});

/** The ⋮ menu (Copy/Rename/Delete) and double-click-to-rename — Copy/Rename were 2026-08-11's owner
 *  ask; Delete is 2026-08-29's. */
describe("per-file overflow menu — copy, rename, and delete", () => {
  /**
   * The ⋮ trigger is revealed by CSS (`:hover`/`:focus-within`/`[aria-expanded]`), which jsdom does
   * not compute — not testable directly here. What IS testable, and is the one piece of that reveal
   * logic actually driven by React state rather than pure CSS interaction, is that the SELECTED
   * row's own `.is-active` class (the state class `.theme-explore-file-row.is-active .row-menu-trigger`
   * keys off) tracks `selected` correctly. A regression here (e.g. `is-active` applied to the wrong
   * row) would make the CSS rule's live-browser behavior wrong regardless of the rule itself.
   */
  it("marks only the selected file's row is-active, for the CSS reveal rule to key off", () => {
    render(
      <ThemeExplore themeId="novice" useThemeExploreHook={() => controller({ selected: "pages/about.html" })} />
    );
    const aboutRow = screen.getByRole("button", { name: "about" }).closest("li");
    const indexRow = screen.getByRole("button", { name: "index" }).closest("li");
    expect(aboutRow).toHaveClass("theme-explore-file-row", "is-active");
    expect(indexRow).toHaveClass("theme-explore-file-row");
    expect(indexRow).not.toHaveClass("is-active");
  });

  it("offers Copy, Rename, and Delete for every file, including identity-locked ones (script)", async () => {
    const user = userEvent.setup();
    render(<ThemeExplore themeId="novice" useThemeExploreHook={() => controller()} />);
    await user.click(screen.getByRole("button", { name: /more actions for main\.js/i }));
    expect(screen.getByRole("menuitem", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
  });

  it("Delete in the ⋮ menu calls openDeleteConfirm with that file's path", async () => {
    const user = userEvent.setup();
    const openDeleteConfirm = vi.fn();
    render(<ThemeExplore themeId="novice" useThemeExploreHook={() => controller({ openDeleteConfirm })} />);
    await user.click(screen.getByRole("button", { name: /more actions for about/i }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(openDeleteConfirm).toHaveBeenCalledWith("pages/about.html");
  });

  it("Copy in the ⋮ menu calls copyFile with that file's path", async () => {
    const user = userEvent.setup();
    const copyFile = vi.fn();
    render(<ThemeExplore themeId="novice" useThemeExploreHook={() => controller({ copyFile })} />);
    await user.click(screen.getByRole("button", { name: /more actions for about/i }));
    await user.click(screen.getByRole("menuitem", { name: "Copy" }));
    expect(copyFile).toHaveBeenCalledWith("pages/about.html");
  });

  it("Rename in the ⋮ menu calls startRename with that file's path", async () => {
    const user = userEvent.setup();
    const startRename = vi.fn();
    render(<ThemeExplore themeId="novice" useThemeExploreHook={() => controller({ startRename })} />);
    await user.click(screen.getByRole("button", { name: /more actions for about/i }));
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(startRename).toHaveBeenCalledWith("pages/about.html");
  });

  it("double-clicking a filename calls startRename — the fast path the owner asked for alongside the menu", async () => {
    const user = userEvent.setup();
    const startRename = vi.fn();
    render(<ThemeExplore themeId="novice" useThemeExploreHook={() => controller({ startRename })} />);
    await user.dblClick(screen.getByRole("button", { name: "about" }));
    expect(startRename).toHaveBeenCalledWith("pages/about.html");
  });

  it("renders an inline text input in place of the filename while that file is being renamed", () => {
    render(
      <ThemeExplore
        themeId="novice"
        useThemeExploreHook={() => controller({ renamingPath: "pages/about.html", renameDraft: "about" })}
      />
    );
    expect(screen.getByDisplayValue("about")).toBeInTheDocument();
    // The plain filename button for THIS file is replaced, not just covered — only one control for
    // "about" should exist at a time.
    expect(screen.queryByRole("button", { name: "about" })).not.toBeInTheDocument();
    // A different file's row is unaffected.
    expect(screen.getByRole("button", { name: "index" })).toBeInTheDocument();
  });

  it("typing in the rename input calls setRenameDraft", async () => {
    const user = userEvent.setup();
    const setRenameDraft = vi.fn();
    render(
      <ThemeExplore
        themeId="novice"
        useThemeExploreHook={() => controller({ renamingPath: "pages/about.html", renameDraft: "about", setRenameDraft })}
      />
    );
    await user.type(screen.getByDisplayValue("about"), "x");
    expect(setRenameDraft).toHaveBeenCalled();
  });

  it("Enter commits the rename, Escape abandons it", async () => {
    const user = userEvent.setup();
    const commitRename = vi.fn();
    const cancelRename = vi.fn();
    render(
      <ThemeExplore
        themeId="novice"
        useThemeExploreHook={() =>
          controller({ renamingPath: "pages/about.html", renameDraft: "about-us", commitRename, cancelRename })
        }
      />
    );
    const input = screen.getByDisplayValue("about-us");
    await user.type(input, "{Enter}");
    expect(commitRename).toHaveBeenCalledTimes(1);
    expect(cancelRename).not.toHaveBeenCalled();

    await user.type(input, "{Escape}");
    expect(cancelRename).toHaveBeenCalledTimes(1);
  });
});

/**
 * Regression test for this batch's RowMenu wiring (last screen in the "wire every `<RowMenu>` call
 * site" workstream — see `taxonomy/__tests__/taxonomy-agent-drive.unit.test.tsx` for the original
 * finding this reuses). Drives the real `executePageCapability` and the real `createDomPageDriver`,
 * not `userEvent`.
 *
 * KNOWN GAP (documented fully in `taxonomy-agent-drive.unit.test.tsx`): `RowMenu` portals its
 * dropdown to `document.body`, while Tovu's real agent bridge (`App.hooks.tsx`) scopes its driver to
 * `contentEl` on purpose — narrower than `document.body`. The trigger is discoverable and clickable
 * through that scoped root; the item it reveals is not. Asserted directly below (`root: container`,
 * matching `contentEl`) rather than against `document.body`, which would hide the gap.
 */
describe("driving the per-file RowMenu through page.* verbs", () => {
  interface FoundElement {
    handle: string;
    role?: string;
    label: string;
  }

  async function handlesOf(driver: ReturnType<typeof createDomPageDriver>): Promise<string[]> {
    const result = (await executePageCapability(driver, "page.find_elements", {})) as { elements: FoundElement[] };
    return result.elements.map((element) => element.handle);
  }

  it("publishes a distinct, clickable handle per file, path-derived and shared across groups", async () => {
    // "index"/"about" (pages), "nav" (partial) — three different groups, proving the handle is
    // computed once across ALL files, not reset per group (see `ThemeExploreFileList`'s own comment).
    const { container } = render(<ThemeExplore themeId="novice" useThemeExploreHook={() => controller()} />);
    await screen.findByRole("button", { name: "about" });
    // Scoped to `container`, the same way `App.hooks.tsx` scopes the real bridge to `contentEl`
    // rather than `document.body` — see this block's own doc comment above.
    const driver = createDomPageDriver({ root: container, pages: {} });

    const before = await handlesOf(driver);
    expect(before).toContain("theme-explore-file-pages-index-html-menu");
    expect(before).toContain("theme-explore-file-pages-about-html-menu");
    expect(before).toContain("theme-explore-file-nav-html-menu");
    // Distinct handles — path-derived, not position-derived. A duplicate would not fail loudly; it
    // would make `page.click` silently resolve to whichever menu the DOM reaches first (see
    // `buildAgentListHandles`'s own doc comment).
    expect(new Set(before).size).toBe(before.length);
    expect(before).not.toContain("theme-explore-file-pages-about-html-menu-item-copy");

    // The trigger itself IS reachable and clickable through the scoped root — an ordinary
    // descendant of `container`, not portaled.
    await executePageCapability(driver, "page.click", { handle: "theme-explore-file-pages-about-html-menu" });
    await driver.settle?.();

    // Through the production-shaped scoped root, the opened item is still invisible — not because
    // the click failed, but because `RowMenu` rendered it into `document.body`, outside `container`.
    const afterScoped = await handlesOf(driver);
    expect(afterScoped).not.toContain("theme-explore-file-pages-about-html-menu-item-copy");

    // Proves the click DID work and the item DOES exist — just unreachable via the scoped root
    // above. Never used by the real bridge; shown here only to isolate the cause.
    const bodyDriver = createDomPageDriver({ root: document.body, pages: {} });
    const bodyHandles = await handlesOf(bodyDriver);
    expect(bodyHandles).toContain("theme-explore-file-pages-about-html-menu-item-copy");
    // "about"'s own item, not "index"'s — "index"'s menu was never opened.
    expect(bodyHandles).not.toContain("theme-explore-file-pages-index-html-menu-item-copy");
  });
});

/** Renaming a page changes its public URL — the one rename outcome this screen warns about before
 *  it happens, the same way Reset warns before it destroys work. */
describe("page rename URL-change warning", () => {
  it("is not shown until commitRename has diverted into it", () => {
    // `ConfirmDialog` renders its body markup regardless of `open` — same native-`<dialog>` shape as
    // the fullscreen preview dialog above in this file — so the check is the `open` attribute
    // (queried directly, like that dialog's own tests do; `getByRole` treats a `<dialog>` without
    // `open` as outside the accessibility tree, so it cannot find content inside one either).
    render(<ThemeExplore themeId="novice" useThemeExploreHook={() => controller()} />);
    const dialogs = Array.from(document.querySelectorAll("dialog.confirm-dialog"));
    const dialog = dialogs.find((d) => d.textContent?.includes("Rename this page?"));
    expect(dialog?.hasAttribute("open")).toBe(false);
  });

  it("names both the source path and the new name once it is open", () => {
    render(
      <ThemeExplore
        themeId="novice"
        useThemeExploreHook={() =>
          controller({ pageRenameWarning: { path: "pages/about.html", name: "about-us.html" } })
        }
      />
    );
    expect(screen.getByText(/changes its public url/i)).toBeInTheDocument();
    expect(screen.getByText("pages/about.html")).toBeInTheDocument();
    expect(screen.getByText("about-us.html")).toBeInTheDocument();
  });

  it("confirming calls confirmPageRename; cancelling calls cancelPageRenameWarning without it", async () => {
    const user = userEvent.setup();
    const confirmPageRename = vi.fn();
    const cancelPageRenameWarning = vi.fn();
    render(
      <ThemeExplore
        themeId="novice"
        useThemeExploreHook={() =>
          controller({
            pageRenameWarning: { path: "pages/about.html", name: "about-us.html" },
            confirmPageRename,
            cancelPageRenameWarning,
          })
        }
      />
    );
    await user.click(screen.getByRole("button", { name: "Rename page" }));
    expect(confirmPageRename).toHaveBeenCalledTimes(1);
    expect(cancelPageRenameWarning).not.toHaveBeenCalled();
  });
});

/**
 * Delete confirmation (2026-08-29 owner ask) — same "name the exact target, unconditional pause"
 * shape Reset's own dialog above uses, since delete is the one operation on this screen with no undo
 * at all (this repo keeps no theme-file revision history).
 */
describe("delete confirmation", () => {
  it("is not shown until openDeleteConfirm sets a target", () => {
    render(<ThemeExplore themeId="novice" useThemeExploreHook={() => controller()} />);
    const dialogs = Array.from(document.querySelectorAll("dialog.confirm-dialog"));
    const dialog = dialogs.find((d) => d.textContent?.includes("Delete this file?"));
    expect(dialog?.hasAttribute("open")).toBe(false);
  });

  it("names the exact file pending delete, and asks for confirmation", () => {
    render(
      <ThemeExplore
        themeId="novice"
        useThemeExploreHook={() => controller({ deleteTarget: "pages/about.html" })}
      />
    );
    expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
    expect(screen.getByText("pages/about.html")).toBeInTheDocument();
    // Deliberately NOT "cannot be undone" — Reset's own dialog body owns that exact phrase, and both
    // dialogs render unconditionally (see `DeleteFileWarningBody`'s own comment for why the wording
    // is distinct despite the same meaning).
    expect(screen.getByText(/no way to get it back/i)).toBeInTheDocument();
  });

  it("confirming calls confirmDelete; cancelling calls closeDeleteConfirm without it", async () => {
    const user = userEvent.setup();
    const confirmDelete = vi.fn();
    const closeDeleteConfirm = vi.fn();
    render(
      <ThemeExplore
        themeId="novice"
        useThemeExploreHook={() =>
          controller({ deleteTarget: "pages/about.html", confirmDelete, closeDeleteConfirm })
        }
      />
    );
    await user.click(screen.getByRole("button", { name: "Delete file" }));
    expect(confirmDelete).toHaveBeenCalledTimes(1);
    expect(closeDeleteConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(closeDeleteConfirm).toHaveBeenCalledTimes(1);
    expect(confirmDelete).toHaveBeenCalledTimes(1);
  });
});

/**
 * 2026-08-11 toolbar restructure (owner-approved): `← All themes` becomes a button, and Save/Reset
 * move up beside it into the same row instead of docking to the Preview/HTML tab row below. The one
 * requirement that keeps a page-level toolbar honest about acting on a per-FILE screen: both buttons
 * carry the selected file's own name in their label.
 */
describe("toolbar restructure — back button plus file-bound Save/Reset", () => {
  it("renders '← All themes' as a button, not a bare link", () => {
    render(<ThemeExplore themeId="novice" useThemeExploreHook={() => controller()} />);
    const back = screen.getByRole("button", { name: "← All themes" });
    expect(back.tagName).toBe("BUTTON");
    expect(back).toHaveClass("btn-secondary");
  });

  it("labels Save with the selected file's name, and calls save() on click", async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    render(
      <ThemeExplore
        themeId="novice"
        useThemeExploreHook={() => controller({ selected: "pages/about.html", dirty: true, save })}
      />
    );
    const button = screen.getByRole("button", { name: "Save about" });
    expect(button).toHaveClass("btn-primary");
    await user.click(button);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("labels Reset with the selected file's name", () => {
    render(
      <ThemeExplore
        themeId="novice"
        useThemeExploreHook={() => controller({ selected: "pages/about.html" })}
      />
    );
    expect(screen.getByRole("button", { name: "Reset about" })).toBeInTheDocument();
  });

  it("Save reads 'Saved' (not the filename label) once the file is no longer dirty", () => {
    render(
      <ThemeExplore
        themeId="novice"
        useThemeExploreHook={() => controller({ selected: "pages/about.html", dirty: false })}
      />
    );
    expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save about" })).not.toBeInTheDocument();
  });
});

/**
 * Every error on this screen (rename refusal, name collision, containment rejection, a save/reset
 * failure) shares one presentation now: a `Toast`, not the full-width inline banner this used to be
 * (2026-08-11, owner: "it should be a toast" — see `use-theme-explore.hooks.ts`'s `lockedRenameReason`
 * for the rename-refusal case specifically, which is what actually produces `error` for this screen
 * in practice).
 */
describe("error toast", () => {
  it("renders the error as an alert-role toast, not the old inline banner", () => {
    render(
      <ThemeExplore
        themeId="novice"
        useThemeExploreHook={() => controller({ error: "theme.json can't be renamed — every theme requires this exact file to load at all." })}
      />
    );
    const toast = screen.getByRole("alert");
    expect(toast).toHaveTextContent("theme.json can't be renamed");
    // Not a second, competing presentation of the same message.
    expect(document.querySelectorAll(".notice.error").length).toBe(0);
  });

  it("dismissing the toast calls dismissError", async () => {
    const user = userEvent.setup();
    const dismissError = vi.fn();
    render(
      <ThemeExplore
        themeId="novice"
        useThemeExploreHook={() => controller({ error: "boom", dismissError })}
      />
    );
    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(dismissError).toHaveBeenCalledTimes(1);
  });

  it("renders nothing error-shaped when there is no error", () => {
    render(<ThemeExplore themeId="novice" useThemeExploreHook={() => controller({ error: null })} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

/**
 * The publish toggle for the selected page (2026-08-30 owner ask, restyled the same day from a
 * two-button Off/Published segmented control to a single iOS-style switch — "Can the publish just
 * be a toggle rather than the tab... a green toggle, Apple style"). Replaces the invented
 * `_unpublished/` folder convention with a real control.
 *
 * Three shapes, not two: absent entirely for a file the publish question never applies to at all (a
 * partial, a stylesheet, …); a DISABLED "locked" switch with a visible reason for a page that exists
 * but can never be independently toggled (`index`/`404`/a declared template shell) — the regression
 * this pass specifically closes, see the "locked pages" block below; and a live, enabled switch for
 * a real candidate page.
 */
describe("publish toggle — the selected page's publish state", () => {
  it("shows nothing at all for a file the publish question does not apply to", () => {
    for (const path of ["nav.html", "css/styles.css", "js/main.js", "NOTICE.md", "screenshots/index.png"]) {
      renderExplore({ selected: path });
      expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    }
  });

  /**
   * The regression block: `index`/`404`/a declared template shell used to fall into the exact same
   * `published === null` bucket as a stylesheet or an image, so the control vanished for all of them
   * alike — the owner selected `404` specifically, saw nothing, and concluded the publish feature
   * hadn't shipped at all. Each of these three now gets a PRESENT, disabled switch with a reason
   * instead of silently disappearing.
   */
  describe("locked pages — present and disabled, never silently absent", () => {
    it("shows a disabled, ON switch with a reason for the theme's home page (index)", () => {
      renderExplore({ selected: "pages/index.html" });
      const toggle = screen.getByRole("switch", { name: "Publish index" });
      expect(toggle).toHaveAttribute("aria-checked", "true");
      expect(toggle).toBeDisabled();
      expect(screen.getByText("Always published — theme home page")).toBeInTheDocument();
    });

    it("shows a disabled, ON switch with a reason for the site's error page (404) — regression for the exact bug reported: selecting 404 showed no control at all", () => {
      renderExplore({ selected: "pages/404.html" });
      const toggle = screen.getByRole("switch", { name: "Publish 404" });
      expect(toggle).toHaveAttribute("aria-checked", "true");
      expect(toggle).toBeDisabled();
      expect(screen.getByText("Always published — error page")).toBeInTheDocument();
    });

    it("shows a disabled, OFF switch with a reason for a declared template shell — it has no independent public route at all, unlike index/404", () => {
      renderExplore({ selected: "pages/blog-post.html" });
      const toggle = screen.getByRole("switch", { name: "Publish blog-post" });
      expect(toggle).toHaveAttribute("aria-checked", "false");
      expect(toggle).toBeDisabled();
      expect(screen.getByText("Not a standalone page — used as a content template")).toBeInTheDocument();
    });

    it("clicking a locked switch never calls setPagePublished", async () => {
      const user = userEvent.setup();
      const setPagePublished = vi.fn();
      renderExplore({ selected: "pages/404.html", setPagePublished });
      // A disabled button does not dispatch click at all — asserts the DOM-level guarantee this
      // control's own handler additionally guards against explicitly (see `ThemeExplorePublishToggle`).
      await user.click(screen.getByRole("switch", { name: "Publish 404" }));
      expect(setPagePublished).not.toHaveBeenCalled();
    });
  });

  it("shows an enabled, ON switch for a page that is currently published", () => {
    renderExplore({ selected: "pages/about.html" });
    const toggle = screen.getByRole("switch", { name: "Publish about" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(toggle).not.toBeDisabled();
  });

  it("shows an enabled, OFF switch for a page that is currently unpublished", () => {
    renderExplore({ selected: "pages/mine.html" });
    const toggle = screen.getByRole("switch", { name: "Publish mine" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).not.toBeDisabled();
  });

  it("clicking the switch calls setPagePublished(false) for the currently published selected page", async () => {
    const user = userEvent.setup();
    const setPagePublished = vi.fn();
    renderExplore({ selected: "pages/about.html", setPagePublished });
    await user.click(screen.getByRole("switch", { name: "Publish about" }));
    expect(setPagePublished).toHaveBeenCalledWith(false);
  });

  it("clicking the switch calls setPagePublished(true) for the currently unpublished selected page", async () => {
    const user = userEvent.setup();
    const setPagePublished = vi.fn();
    renderExplore({ selected: "pages/mine.html", setPagePublished });
    await user.click(screen.getByRole("switch", { name: "Publish mine" }));
    expect(setPagePublished).toHaveBeenCalledWith(true);
  });

  it("disables the switch while a publish round trip is in flight", () => {
    renderExplore({ selected: "pages/about.html", publishing: true });
    expect(screen.getByRole("switch", { name: "Publish about" })).toBeDisabled();
  });

  it("renders the switch on the SAME toolbar row as the Preview/HTML tabs, immediately beside them — not the old separate row below", () => {
    renderExplore({ selected: "pages/about.html" });
    const tablist = screen.getByRole("tablist", { name: "Editor view" });
    const toggle = screen.getByRole("switch", { name: "Publish about" });
    const start = tablist.closest(".theme-explore-toolbar-start");
    expect(start).not.toBeNull();
    expect(toggle.closest(".theme-explore-toolbar-start")).toBe(start);
    // The old dedicated second row is gone entirely, not just hidden.
    expect(document.querySelector(".theme-explore-publish-row")).not.toBeInTheDocument();
  });

  /**
   * The "what is Publish" info icon (owner ask, 2026-08-30) — one explanation for the whole control,
   * so it renders for BOTH shapes {@link ThemeExplorePublishToggle} can take (a live toggle and a
   * locked switch), not just the enabled case. Reuses `InfoTip` (`components/InfoTip.tsx`), which
   * already carries its own dedicated a11y test suite (`InfoTip.unit.test.tsx` — open/close on
   * hover/focus/Escape, accessible name via `aria-label`); these tests cover only this CALL SITE:
   * that the icon is actually wired in with the right copy, in the right place, for every state.
   */
  describe("publish info tooltip", () => {
    const PUBLISH_INFO_LABEL =
      "Whether this page has its own live URL on your site. Theme pages start off, because a theme ships generic placeholder content rather than yours. Turn one on once you've made it your own.";

    it("renders after the switch, not between the label and the switch, for a live toggle", () => {
      renderExplore({ selected: "pages/about.html" });
      const row = screen.getByText("Publish").closest(".theme-explore-publish-toggle") as HTMLElement;
      expect(row).not.toBeNull();
      const icon = within(row).getByLabelText(PUBLISH_INFO_LABEL);
      const switchEl = within(row).getByRole("switch", { name: "Publish about" });
      // DOM order, not just co-presence. The icon follows the switch (owner, 2026-08-30, revising
      // an earlier "right after Publish": "i wanted you to have the info icon after the toggle").
      expect(
        switchEl.compareDocumentPosition(icon) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });

    it("also renders for a LOCKED page (404) — the explanation applies regardless of which of the two shapes is showing", () => {
      renderExplore({ selected: "pages/404.html" });
      expect(screen.getByLabelText(PUBLISH_INFO_LABEL)).toBeInTheDocument();
    });

    it("is reachable and openable by keyboard alone, not hover-only", () => {
      renderExplore({ selected: "pages/about.html" });
      expect(screen.queryByText(PUBLISH_INFO_LABEL)).not.toBeInTheDocument();
      const icon = screen.getByLabelText(PUBLISH_INFO_LABEL);
      // `fireEvent` (auto-`act()`-wrapped by RTL) rather than a raw `.focus()` call, so the resulting
      // `useInfoTip` state update is flushed before the assertion — the same open-on-focus path
      // `InfoTip.unit.test.tsx`'s own "opens on focus" case proves for the component in isolation;
      // this is the call-site wiring check.
      fireEvent.focus(icon);
      expect(screen.getByText(PUBLISH_INFO_LABEL)).toBeInTheDocument();
    });
  });
});

/**
 * Slug-collision warning (2026-08-30) — the theme-page side of the identical fact
 * `PostEditor.tsx`'s `PostEditorSlugCollisionWarning` already surfaces from the post side: another
 * resource claims this page's own URL.
 *
 * Deliberately exercised on an UNPUBLISHED page (`pages/mine.html`, `published: false` in the base
 * `FILES` fixture) rather than a published one — see `ThemeExploreSlugCollisionWarning`'s own doc
 * for why: `resolveMarketingPageOrOverride` never even consults an unpublished theme page's own
 * state before letting a live post win the slug, so gating this warning on `published` would hide
 * it for exactly the case that caused the live confusion this feature exists to prevent (a page
 * switched OFF, expecting its URL to 404, whose URL still 200'd via a colliding post).
 */
describe("slug-collision warning — a content record claims this page's own URL", () => {
  const COLLIDING_CONTENT = { id: "post-1", slug: "mine", title: "What Is Tovu?", kind: "post" as const };
  // Widened past `typeof COLLIDING_CONTENT` (`kind: "post"` only) so a `kind: "page"` fixture —
  // used by the tests below it — type-checks with no cast; pre-existing narrowness this file's own
  // `kind: "page" as const` fixtures were already silently failing tsc against (2026-09-03 fix,
  // caught widening this same collision fixture to cover the root-slug case).
  type CollidingContent = { id: string; slug: string; title: string; kind: "post" | "page" };

  function filesWithCollision(path: string, collidingContent: CollidingContent | null) {
    return FILES.map((f) => (f.path === path ? { ...f, collidingContent } : f));
  }

  it("renders nothing when the selected file has no colliding content", () => {
    renderExplore({ selected: "pages/mine.html" });
    expect(document.querySelector('[data-agent-element="theme-explore-slug-collision-warning"]')).not.toBeInTheDocument();
  });

  it("renders the warning, naming the colliding record, for an UNPUBLISHED page — the toggle's own state does not gate this", () => {
    renderExplore({ selected: "pages/mine.html", files: filesWithCollision("pages/mine.html", COLLIDING_CONTENT) });
    const toggle = screen.getByRole("switch", { name: "Publish mine" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    const warning = document.querySelector('[data-agent-element="theme-explore-slug-collision-warning"]');
    expect(warning).toBeInTheDocument();
    expect(within(warning as HTMLElement).getByText(/A content record shares this page's URL: What Is Tovu\?/)).toBeInTheDocument();
  });

  it("renders the warning for a PUBLISHED page too — a colliding post can still win by default even when the page is on", () => {
    renderExplore({ selected: "pages/about.html", files: filesWithCollision("pages/about.html", COLLIDING_CONTENT) });
    expect(document.querySelector('[data-agent-element="theme-explore-slug-collision-warning"]')).toBeInTheDocument();
  });

  it("does not render for a DIFFERENT selected file just because some other file has a collision", () => {
    renderExplore({ selected: "pages/about.html", files: filesWithCollision("pages/mine.html", COLLIDING_CONTENT) });
    expect(document.querySelector('[data-agent-element="theme-explore-slug-collision-warning"]')).not.toBeInTheDocument();
  });

  it("links to the colliding POST's own editor route", () => {
    renderExplore({ selected: "pages/mine.html", files: filesWithCollision("pages/mine.html", COLLIDING_CONTENT) });
    const link = screen.getByRole("link", { name: /What Is Tovu\?/ });
    expect(link).toHaveAttribute("href", "/admin/posts/post-1");
  });

  it("links to the colliding PAGE's own editor route (keyed by slug, not id)", () => {
    const collidingPage = { id: "page-1", slug: "mine", title: "Old Mine Page", kind: "page" as const };
    renderExplore({ selected: "pages/mine.html", files: filesWithCollision("pages/mine.html", collidingPage) });
    const link = screen.getByRole("link", { name: /Old Mine Page/ });
    expect(link).toHaveAttribute("href", "/admin/pages/mine");
  });

  /**
   * Regression test — a colliding Page holding the literal root slug `"/"` must fall back to the
   * id (`pageAdminPath`, `features/pages/rules.ts`, 2026-09-03), since `/admin/pages//` cannot
   * match the admin router's `/:slug` pattern and the link would silently do nothing. Must FAIL
   * against a bare `/pages/${slug}` template and pass now that this route goes through
   * `pageAdminPath`.
   */
  it("links to the colliding PAGE's own editor route by id when it holds the root slug '/'", () => {
    const collidingHomePage = { id: "home-1", slug: "/", title: "Home", kind: "page" as const };
    renderExplore({ selected: "pages/mine.html", files: filesWithCollision("pages/mine.html", collidingHomePage) });
    const link = screen.getByRole("link", { name: /Home/ });
    expect(link).toHaveAttribute("href", "/admin/pages/home-1");
  });

  it("clicking the link navigates via the SPA router instead of a full page load", async () => {
    window.history.replaceState(null, "", "/");
    const user = userEvent.setup();
    renderExplore({ selected: "pages/mine.html", files: filesWithCollision("pages/mine.html", COLLIDING_CONTENT) });
    const link = screen.getByRole("link", { name: /What Is Tovu\?/ });

    await user.click(link);

    expect(window.location.pathname).toBe("/admin/posts/post-1");
    window.history.replaceState(null, "", "/");
  });
});

describe("editable HTML source textarea", () => {
  it("calls setSource as the operator types", async () => {
    const user = userEvent.setup();
    const setSource = vi.fn();
    renderExplore({ view: "html", selected: "pages/index.html", source: "", setSource });

    const textarea = screen.getByRole("textbox", { name: "Theme file source" });
    await user.type(textarea, "x");

    expect(setSource).toHaveBeenCalledWith("x");
  });
});

describe("ThemeExploreDirectionsNotice — no stored original", () => {
  it("shows nothing when the theme has a stored original (the default)", () => {
    renderExplore();
    expect(screen.queryByText(/cannot be reset/)).not.toBeInTheDocument();
  });

  it("warns that edits cannot be reset when the theme has no stored original", () => {
    renderExplore({
      detail: {
        id: "novice",
        name: "Novice",
        tier: "static",
        apiVersion: undefined,
        status: "valid",
        errors: [],
        lineage: null,
        hasOriginal: false,
      },
    });
    expect(screen.getByText(/cannot be reset/)).toBeInTheDocument();
  });
});

describe("ThemeExploreStatusNotice — theme failing to load", () => {
  it("shows nothing when the theme's status is valid (the default)", () => {
    renderExplore();
    expect(screen.queryByText("This theme is not loading:")).not.toBeInTheDocument();
  });

  it("shows the theme's own errors when its status is not valid", () => {
    renderExplore({
      detail: {
        id: "novice",
        name: "Novice",
        tier: "static",
        apiVersion: undefined,
        status: "error",
        errors: ["theme.json is not valid JSON", "missing pages/index.html"],
        lineage: null,
        hasOriginal: true,
      },
    });
    expect(screen.getByText(/This theme is not loading:/)).toBeInTheDocument();
    expect(screen.getByText(/theme\.json is not valid JSON; missing pages\/index\.html/)).toBeInTheDocument();
  });
});

describe("Preview/HTML view tabs", () => {
  it("clicking the HTML tab calls setView", async () => {
    const user = userEvent.setup();
    const setView = vi.fn();
    renderExplore({ setView });

    await user.click(screen.getByRole("tab", { name: "HTML" }));

    expect(setView).toHaveBeenCalledWith("html");
  });

  it("clicking the Preview tab calls setView", async () => {
    const user = userEvent.setup();
    const setView = vi.fn();
    renderExplore({ view: "html", setView });

    await user.click(screen.getByRole("tab", { name: "Preview" }));

    expect(setView).toHaveBeenCalledWith("preview");
  });
});

describe("reset confirm dialog — confirming actually resets", () => {
  it("clicking 'Reset file' in the confirm dialog calls reset()", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    renderExplore({ resetConfirmOpen: true, reset });

    await user.click(screen.getByRole("button", { name: "Reset file" }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("'← All themes' navigates back to the theme list", () => {
  it("clicking it navigates via the SPA router instead of a full page load", async () => {
    window.history.replaceState(null, "", "/admin/themes/explore?theme=novice");
    const user = userEvent.setup();
    renderExplore();

    await user.click(screen.getByRole("button", { name: "← All themes" }));

    expect(window.location.pathname).toBe("/admin/themes");
    window.history.replaceState(null, "", "/");
  });
});

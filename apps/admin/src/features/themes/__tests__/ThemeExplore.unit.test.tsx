import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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
  { path: "pages/index.html", label: "index", kind: "page", readable: true, editable: true, resettable: true },
  { path: "pages/about.html", label: "about", kind: "page", readable: true, editable: true, resettable: true },
  { path: "nav.html", label: "nav", kind: "partial", readable: true, editable: true, resettable: true },
  { path: "footer.html", label: "footer", kind: "partial", readable: true, editable: true, resettable: true },
  { path: "css/styles.css", label: "styles.css", kind: "style", readable: true, editable: true, resettable: true },
  // Read-only-to-edit (2026-08-11 owner ask): readable so its source can be viewed, not editable so
  // it can't be saved from this screen.
  { path: "js/main.js", label: "main.js", kind: "script", readable: true, editable: false, resettable: true },
  // The `other` catch-all group — also read-only-to-edit, but for a different reason (never asked to
  // be edited here at all, not "the owner doesn't want it edited").
  { path: "NOTICE.md", label: "NOTICE.md", kind: "other", readable: true, editable: false, resettable: false },
  // Binary + author-added: the two cases that must NOT offer an editor or a Reset respectively.
  { path: "screenshots/index.png", label: "index.png", kind: "asset", readable: false, editable: false, resettable: true },
  { path: "pages/mine.html", label: "mine", kind: "page", readable: true, editable: true, resettable: false },
];

function controller(overrides: Partial<ThemeExploreController> = {}): ThemeExploreController {
  return {
    detail: {
      id: "novice",
      name: "Novice",
      tier: "static",
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

describe("preview src — pages vs. partials", () => {
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
      files: [...FILES, { path: "vendor.bin", label: "vendor.bin", kind: "other", readable: false, editable: false, resettable: false }],
      selected: "vendor.bin",
    });
    const iframe = screen.getByTitle("Theme preview") as HTMLIFrameElement;
    expect(iframe.src).toContain("/theme-assets/novice/vendor.bin");
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
});

/**
 * JS/`other` read-only (2026-08-11 owner ask: "I don't want JS edited from this screen"). `readable`
 * and `editable` used to be one flag; a script is now `readable: true, editable: false`, which must
 * render as visible-but-not-editable, not as the binary-file notice these files are NOT.
 */
describe("read-only groups (scripts, other)", () => {
  it("shows a script's source in a read-only viewer with a visible reason, not an editable textarea", () => {
    render(
      <ThemeExplore
        themeId="novice"
        useThemeExploreHook={() => controller({ selected: "js/main.js", view: "html" })}
      />
    );
    // Not the binary notice — a script IS text, and must still be readable.
    expect(screen.queryByText(/binary file/i)).not.toBeInTheDocument();
    expect(screen.getByText(/scripts are read-only in explore/i)).toBeInTheDocument();
    const textarea = screen.getByLabelText("Theme file source (read-only)") as HTMLTextAreaElement;
    expect(textarea).toHaveAttribute("readonly");
  });

  it("shows an 'other'-group file (e.g. NOTICE.md) in the same read-only viewer, with a generic reason", () => {
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
        useThemeExploreHook={() => controller({ selected: "js/main.js", view: "html" })}
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

/** The ⋮ menu (Copy/Rename) and double-click-to-rename — 2026-08-11 owner ask, the headline feature
 *  of this pass. */
describe("per-file overflow menu — copy and rename", () => {
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

  it("offers Copy and Rename for every file, including read-only-to-edit ones", async () => {
    const user = userEvent.setup();
    render(<ThemeExplore themeId="novice" useThemeExploreHook={() => controller()} />);
    await user.click(screen.getByRole("button", { name: /more actions for main\.js/i }));
    expect(screen.getByRole("menuitem", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
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

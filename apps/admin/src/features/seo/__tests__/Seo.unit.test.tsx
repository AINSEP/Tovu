import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Seo } from "../Seo";
import type { SeoController } from "../hooks/use-seo.hooks";
import type { EntryPickerController } from "../hooks/use-entry-picker.hooks";
import type { SeoEntryPanelController } from "../hooks/use-seo-entry-panel.hooks";
import type { SeoEntrySectionController } from "../hooks/use-seo-entry-section.hooks";
import type { SitemapModalController } from "../hooks/use-sitemap-modal.hooks";
import type { AdminPost, SeoEntryAnalysis, SeoEntryMeta, SeoSettings } from "@/lib/api";

/**
 * @file `Seo` — the SEO settings screen (SPEC-008 §2.4/§2.5/§2.6, SPEC-037 REQ-06/07/08). Only
 * `Seo` itself is exported; `EntryPicker`, `AnalyzePanel`, `SeoEntryPanel`, `SeoEntrySection` are
 * internal. Each of the four declares its own `use*Hook` DI seam, but — same situation as
 * `Recovery.tsx`'s `RestoreFlow` and `Database.tsx`'s sections — the parent never threads a prop
 * through when it instantiates a child (`SeoEntrySection` renders `<EntryPicker .../>` and
 * `<SeoEntryPanel .../>` with no hook prop; `Seo` renders `<SeoEntrySection />` the same way). A
 * prior agent flagged these four as possibly untestable in isolation for exactly this reason.
 *
 * They ARE reachable: each hook module is mocked via a `vi.hoisted` ref (the same fallback seam
 * proven out for `Recovery.tsx`, `Database.tsx`, and `Collections.tsx`'s dialogs), giving full
 * control over every state without a real `fetch`. `AnalyzePanel` has no hook of its own — it only
 * takes `analysis` as a prop — so it's reached simply by giving `SeoEntryPanel`'s mocked controller
 * a non-null `analysis`.
 */

const { seoRef, entryPickerRef, seoEntryPanelRef, seoEntrySectionRef, sitemapModalRef } = vi.hoisted(() => ({
  seoRef: { current: null as unknown },
  entryPickerRef: { current: null as unknown },
  seoEntryPanelRef: { current: null as unknown },
  seoEntrySectionRef: { current: null as unknown },
  sitemapModalRef: { current: null as unknown },
}));

vi.mock("../hooks/use-seo.hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/use-seo.hooks")>();
  return { ...actual, useWiredSeo: () => seoRef.current };
});
vi.mock("../hooks/use-entry-picker.hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/use-entry-picker.hooks")>();
  return { ...actual, useWiredEntryPicker: () => entryPickerRef.current };
});
vi.mock("../hooks/use-seo-entry-panel.hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/use-seo-entry-panel.hooks")>();
  return { ...actual, useWiredSeoEntryPanel: () => seoEntryPanelRef.current };
});
vi.mock("../hooks/use-seo-entry-section.hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/use-seo-entry-section.hooks")>();
  return { ...actual, useSeoEntrySection: () => seoEntrySectionRef.current };
});
// `SitemapModal` is only ever rendered while `sitemapModalOpen` is true (`Seo.tsx`'s own
// conditional), but mounting it also mounts its real `useWiredSitemapModal` — which would fire a
// real `fetch("/sitemap.xml")` in this unit test. Mocked the same way the three hooks above are,
// so `Seo.unit.test.tsx` only ever asserts the dialog is present, never drives its own fetch/parse
// behavior (that lives in `SitemapModal.unit.test.tsx`, composed against `createFakeSitemapPort`).
vi.mock("../hooks/use-sitemap-modal.hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/use-sitemap-modal.hooks")>();
  return { ...actual, useWiredSitemapModal: () => sitemapModalRef.current };
});

const SETTINGS: SeoSettings = {
  titleTemplate: "%s | Site",
  defaultDescription: "A default description",
  defaultOgImage: "media:og1",
  twitterSite: "@site",
  defaultRobots: { noindex: false, nofollow: false },
  sitemapEnabled: true,
  robotsRules: [],
};

const RESOLVED: SeoEntryMeta = {
  title: "Entry title",
  description: "Entry description",
  canonical: "https://example.com/entry",
  robots: { noindex: false, nofollow: false },
  openGraph: { title: "OG title", description: "OG desc", type: "article", url: "https://example.com/entry", image: "og.png" },
  twitter: { card: "summary", title: "Twitter title", description: "Twitter desc", image: "tw.png" },
  jsonLd: [],
};

const ANALYSIS: SeoEntryAnalysis = {
  entryId: "e1",
  score: 82,
  issues: [
    { code: "missing-alt", severity: "warning", message: "Image missing alt text", field: "body" },
    { code: "no-canonical", severity: "error", message: "No canonical URL set" },
  ],
  resolved: RESOLVED,
};

const POST: AdminPost = {
  id: "p1",
  workspaceId: "w1",
  kind: "post",
  title: "My Post",
  slug: "my-post",
  bodyJson: {},
  status: "published",
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

function seoController(overrides: Partial<SeoController> = {}): SeoController {
  return {
    settings: SETTINGS,
    error: null,
    saving: false,
    notice: null,
    save: vi.fn(async () => {}),
    regenerateSitemap: vi.fn(async () => true),
    sitemapModalOpen: false,
    openSitemapModal: vi.fn(),
    closeSitemapModal: vi.fn(),
    // Matches what this screen got from a real, unmocked `useAdminLocale()` call before this
    // hook's own i18n pass (defaults to "en" synchronously).
    locale: "en",
    ...overrides,
  };
}

function entryPickerController(overrides: Partial<EntryPickerController> = {}): EntryPickerController {
  return { entries: [POST], error: null, ...overrides };
}

function seoEntryPanelController(overrides: Partial<SeoEntryPanelController> = {}): SeoEntryPanelController {
  const touched: Record<string, unknown> = (overrides.touched as Record<string, unknown>) ?? {};
  return {
    resolved: RESOLVED,
    analysis: null,
    loadError: null,
    saving: false,
    saveError: null,
    notice: null,
    fieldValue: ((key: string, resolvedValue: unknown) => (key in touched ? touched[key] : resolvedValue)) as SeoEntryPanelController["fieldValue"],
    setField: vi.fn(),
    save: vi.fn(async () => {}),
    touched: {},
    ...overrides,
  };
}

function seoEntrySectionController(overrides: Partial<SeoEntrySectionController> = {}): SeoEntrySectionController {
  return { entryId: "", setEntryId: vi.fn(), ...overrides };
}

/** Default {@link SitemapModalController} for `Seo.unit.test.tsx`'s own "does the dialog render at
 *  all" tests — a fixed `"ready"`/zero-entries snapshot, never a real fetch. Behavioral coverage of
 *  the modal's own fetch/parse/filter/toggle logic lives in `SitemapModal.unit.test.tsx`. */
function sitemapModalController(overrides: Partial<SitemapModalController> = {}): SitemapModalController {
  return {
    status: "ready",
    error: null,
    xmlText: "",
    entries: [],
    filteredEntries: [],
    filter: "",
    setFilter: vi.fn(),
    view: "table",
    setView: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  seoRef.current = seoController();
  entryPickerRef.current = entryPickerController();
  seoEntryPanelRef.current = seoEntryPanelController();
  seoEntrySectionRef.current = seoEntrySectionController();
  sitemapModalRef.current = sitemapModalController();
});

function renderSeo(overrides: Partial<SeoController> = {}) {
  seoRef.current = seoController(overrides);
  render(<Seo />);
}

describe("Seo — loading and error states", () => {
  it("shows a loading notice while settings is null and there is no error", () => {
    renderSeo({ settings: null, error: null });
    expect(screen.getByText("Loading SEO settings…")).toBeInTheDocument();
  });

  it("shows only the error notice when settings is still null and error is set", () => {
    renderSeo({ settings: null, error: "failed to load SEO settings" });
    expect(screen.getByText("failed to load SEO settings")).toBeInTheDocument();
  });

  it("shows an inline banner ABOVE the form once settings have loaded and a later error occurs", () => {
    renderSeo({ settings: SETTINGS, error: "failed to save SEO settings" });
    expect(screen.getByText("failed to save SEO settings")).toBeInTheDocument();
    // The <form> has no accessible name, so it carries no implicit ARIA "form" role — assert its
    // presence structurally instead.
    expect(document.querySelector("form.card")).toBeInTheDocument();
  });

  it("shows the notice banner on success", () => {
    renderSeo({ notice: "Saved." });
    expect(screen.getByText("Saved.")).toBeInTheDocument();
  });
});

describe("Seo — defaults form", () => {
  it("pre-fills every field from settings", () => {
    renderSeo();
    expect(screen.getByLabelText(/Title template/)).toHaveValue("%s | Site");
    expect(screen.getByLabelText("Default meta description")).toHaveValue("A default description");
    expect(screen.getByLabelText(/Default Open Graph/)).toHaveValue("media:og1");
    expect(screen.getByLabelText("Twitter @site handle")).toHaveValue("@site");
    expect(screen.getByRole("checkbox", { name: "Default noindex" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Default nofollow" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Sitemap enabled" })).toBeChecked();
  });

  it("falls back to empty strings for optional fields the settings omit", () => {
    renderSeo({
      settings: { titleTemplate: "%s", defaultRobots: { noindex: false, nofollow: false }, sitemapEnabled: false, robotsRules: [] },
    });
    expect(screen.getByLabelText("Default meta description")).toHaveValue("");
    expect(screen.getByLabelText(/Default Open Graph/)).toHaveValue("");
    expect(screen.getByLabelText("Twitter @site handle")).toHaveValue("");
  });

  it("submitting the form calls save with FormData parsed into a SeoSettings patch", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async (_patch: Partial<SeoSettings>) => {});
    renderSeo({ save });
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    expect(save).toHaveBeenCalledWith({
      titleTemplate: "%s | Site",
      defaultDescription: "A default description",
      defaultOgImage: "media:og1",
      twitterSite: "@site",
      defaultRobots: { noindex: false, nofollow: false },
      sitemapEnabled: true,
    });
  });

  it("submitting with the robots checkboxes checked sends noindex/nofollow true", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async (_patch: Partial<SeoSettings>) => {});
    renderSeo({ save });
    await user.click(screen.getByRole("checkbox", { name: "Default noindex" }));
    await user.click(screen.getByRole("checkbox", { name: "Default nofollow" }));
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    const patch = save.mock.calls.at(-1)![0];
    expect(patch.defaultRobots).toEqual({ noindex: true, nofollow: true });
  });

  it("submits blank optional fields as undefined, not empty strings", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async (_patch: Partial<SeoSettings>) => {});
    renderSeo({
      settings: { titleTemplate: "%s", defaultRobots: { noindex: false, nofollow: false }, sitemapEnabled: false, robotsRules: [] },
      save,
    });
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    const patch = save.mock.calls.at(-1)![0];
    expect(patch.defaultDescription).toBeUndefined();
    expect(patch.defaultOgImage).toBeUndefined();
    expect(patch.twitterSite).toBeUndefined();
  });

  it("submits an emptied titleTemplate as '', NOT the '%s' fallback — FormData.get() returns '' for a present-but-empty field, never null, so the `?? \"%s\"` fallback is unreachable through the real form", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async (_patch: Partial<SeoSettings>) => {});
    renderSeo({ save });
    await user.clear(screen.getByLabelText(/Title template/));
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    const patch = save.mock.calls.at(-1)![0];
    expect(patch.titleTemplate).toBe("");
  });

  it("shows 'Saving…' and disables the submit button while saving", () => {
    renderSeo({ saving: true });
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });
});

describe("Seo — sitemap regenerate", () => {
  it("clicking Regenerate sitemap calls regenerateSitemap", async () => {
    const user = userEvent.setup();
    const regenerateSitemap = vi.fn(async () => true);
    renderSeo({ regenerateSitemap });
    await user.click(screen.getByRole("button", { name: "Regenerate sitemap" }));
    expect(regenerateSitemap).toHaveBeenCalledTimes(1);
  });

  it("shows 'Working…' and disables the button while saving is true", () => {
    renderSeo({ saving: true });
    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
  });
});

describe("Seo — View sitemap modal", () => {
  it("does not render the sitemap modal when sitemapModalOpen is false", () => {
    renderSeo({ sitemapModalOpen: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clicking View sitemap calls openSitemapModal", async () => {
    const user = userEvent.setup();
    const openSitemapModal = vi.fn();
    renderSeo({ openSitemapModal });
    await user.click(screen.getByRole("button", { name: "View sitemap" }));
    expect(openSitemapModal).toHaveBeenCalledTimes(1);
  });

  it("renders the sitemap modal when sitemapModalOpen is true", () => {
    renderSeo({ sitemapModalOpen: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("SeoEntrySection / EntryPicker", () => {
  it("renders the EntryPicker with no entry selected initially", () => {
    renderSeo();
    expect(screen.getByRole("combobox", { name: "Entry" })).toHaveValue("");
    expect(screen.queryByText("Per-entry overrides")).not.toBeInTheDocument();
  });

  it("EntryPicker: shows a loading notice while entries is null", () => {
    entryPickerRef.current = entryPickerController({ entries: null });
    renderSeo();
    expect(screen.getByText("Loading entries…")).toBeInTheDocument();
  });

  it("EntryPicker: shows its own error instead of the select", () => {
    entryPickerRef.current = entryPickerController({ entries: null, error: "failed to load entries" });
    renderSeo();
    expect(screen.getByText("failed to load entries")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("EntryPicker: lists each entry as '{title} ({status})'", () => {
    renderSeo();
    expect(screen.getByRole("option", { name: "My Post (published)" })).toBeInTheDocument();
  });

  it("changing the picker calls setEntryId", async () => {
    const user = userEvent.setup();
    const setEntryId = vi.fn();
    seoEntrySectionRef.current = seoEntrySectionController({ setEntryId });
    renderSeo();
    await user.selectOptions(screen.getByRole("combobox", { name: "Entry" }), "p1");
    expect(setEntryId).toHaveBeenCalledWith("p1");
  });

  it("SeoEntryPanel is not rendered when entryId is blank", () => {
    seoEntrySectionRef.current = seoEntrySectionController({ entryId: "" });
    renderSeo();
    expect(screen.queryByText("Per-entry overrides")).not.toBeInTheDocument();
  });

  it("SeoEntryPanel renders once entryId is set", () => {
    seoEntrySectionRef.current = seoEntrySectionController({ entryId: "p1" });
    renderSeo();
    expect(screen.getByText("Per-entry overrides")).toBeInTheDocument();
  });
});

describe("SeoEntryPanel", () => {
  function renderPanel(overrides: Partial<SeoEntryPanelController> = {}) {
    seoEntrySectionRef.current = seoEntrySectionController({ entryId: "p1" });
    seoEntryPanelRef.current = seoEntryPanelController(overrides);
    renderSeo();
  }

  it("shows a loading notice while resolved is null and there is no loadError", () => {
    renderPanel({ resolved: null });
    expect(screen.getByText("Loading entry SEO…")).toBeInTheDocument();
  });

  it("shows only the load error when loadError is set", () => {
    renderPanel({ resolved: null, loadError: "failed to load entry SEO data" });
    expect(screen.getByText("failed to load entry SEO data")).toBeInTheDocument();
    expect(screen.queryByText("Per-entry overrides")).not.toBeInTheDocument();
  });

  it("pre-fills every field from the resolved (effective) meta", () => {
    renderPanel();
    expect(screen.getByLabelText("Title")).toHaveValue("Entry title");
    expect(screen.getByLabelText("Description")).toHaveValue("Entry description");
    expect(screen.getByLabelText("Canonical URL")).toHaveValue("https://example.com/entry");
    expect(screen.getByRole("checkbox", { name: "Noindex" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Nofollow" })).not.toBeChecked();
    expect(screen.getByLabelText("OG title")).toHaveValue("OG title");
    expect(screen.getByLabelText("OG description")).toHaveValue("OG desc");
    expect(screen.getByLabelText(/OG image/)).toHaveValue("og.png");
    expect(screen.getByLabelText("Twitter title")).toHaveValue("Twitter title");
    expect(screen.getByLabelText("Twitter description")).toHaveValue("Twitter desc");
    expect(screen.getByLabelText("Twitter image (media ref or URL)")).toHaveValue("tw.png");
  });

  it("falls back to '' for optional resolved fields the entry omits", () => {
    renderPanel({
      resolved: { ...RESOLVED, description: undefined, openGraph: { ...RESOLVED.openGraph, description: undefined, image: undefined }, twitter: { ...RESOLVED.twitter, description: undefined, image: undefined } },
    });
    expect(screen.getByLabelText("Description")).toHaveValue("");
    expect(screen.getByLabelText("OG description")).toHaveValue("");
    expect(screen.getByLabelText(/OG image/)).toHaveValue("");
  });

  it("typing in the Title field calls setField('title', value)", async () => {
    const user = userEvent.setup();
    const setField = vi.fn();
    renderPanel({ setField });
    await user.type(screen.getByLabelText("Title"), "x");
    expect(setField).toHaveBeenCalledWith("title", expect.any(String));
  });

  it("toggling Noindex calls setField('noindex', checked)", async () => {
    const user = userEvent.setup();
    const setField = vi.fn();
    renderPanel({ setField });
    await user.click(screen.getByRole("checkbox", { name: "Noindex" }));
    expect(setField).toHaveBeenCalledWith("noindex", true);
  });

  it("toggling Nofollow calls setField('nofollow', checked)", async () => {
    const user = userEvent.setup();
    const setField = vi.fn();
    renderPanel({ setField });
    await user.click(screen.getByRole("checkbox", { name: "Nofollow" }));
    expect(setField).toHaveBeenCalledWith("nofollow", true);
  });

  it("typing in Description calls setField('description', value)", async () => {
    const user = userEvent.setup();
    const setField = vi.fn();
    renderPanel({ setField });
    await user.type(screen.getByLabelText("Description"), "x");
    expect(setField).toHaveBeenCalledWith("description", expect.any(String));
  });

  it("typing in Canonical URL calls setField('canonical', value)", async () => {
    const user = userEvent.setup();
    const setField = vi.fn();
    renderPanel({ setField });
    await user.type(screen.getByLabelText("Canonical URL"), "x");
    expect(setField).toHaveBeenCalledWith("canonical", expect.any(String));
  });

  it("typing in OG title calls setField('ogTitle', value)", async () => {
    const user = userEvent.setup();
    const setField = vi.fn();
    renderPanel({ setField });
    await user.type(screen.getByLabelText("OG title"), "x");
    expect(setField).toHaveBeenCalledWith("ogTitle", expect.any(String));
  });

  it("typing in OG description calls setField('ogDescription', value)", async () => {
    const user = userEvent.setup();
    const setField = vi.fn();
    renderPanel({ setField });
    await user.type(screen.getByLabelText("OG description"), "x");
    expect(setField).toHaveBeenCalledWith("ogDescription", expect.any(String));
  });

  it("typing in OG image calls setField('ogImage', value)", async () => {
    const user = userEvent.setup();
    const setField = vi.fn();
    renderPanel({ setField });
    await user.type(screen.getByLabelText("OG image (media ref or URL)"), "x");
    expect(setField).toHaveBeenCalledWith("ogImage", expect.any(String));
  });

  it("typing in Twitter title calls setField('twitterTitle', value)", async () => {
    const user = userEvent.setup();
    const setField = vi.fn();
    renderPanel({ setField });
    await user.type(screen.getByLabelText("Twitter title"), "x");
    expect(setField).toHaveBeenCalledWith("twitterTitle", expect.any(String));
  });

  it("typing in Twitter description calls setField('twitterDescription', value)", async () => {
    const user = userEvent.setup();
    const setField = vi.fn();
    renderPanel({ setField });
    await user.type(screen.getByLabelText("Twitter description"), "x");
    expect(setField).toHaveBeenCalledWith("twitterDescription", expect.any(String));
  });

  it("typing in Twitter image calls setField('twitterImage', value)", async () => {
    const user = userEvent.setup();
    const setField = vi.fn();
    renderPanel({ setField });
    await user.type(screen.getByLabelText("Twitter image (media ref or URL)"), "x");
    expect(setField).toHaveBeenCalledWith("twitterImage", expect.any(String));
  });

  it("every text/textarea field falls back to '' when fieldValue() itself returns undefined (e.g. setField(key, undefined) was called)", () => {
    renderPanel({ fieldValue: (() => undefined) as SeoEntryPanelController["fieldValue"] });
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.getByLabelText("Description")).toHaveValue("");
    expect(screen.getByLabelText("Canonical URL")).toHaveValue("");
    expect(screen.getByLabelText("OG title")).toHaveValue("");
    expect(screen.getByLabelText("OG description")).toHaveValue("");
    expect(screen.getByLabelText("OG image (media ref or URL)")).toHaveValue("");
    expect(screen.getByLabelText("Twitter title")).toHaveValue("");
    expect(screen.getByLabelText("Twitter description")).toHaveValue("");
    expect(screen.getByLabelText("Twitter image (media ref or URL)")).toHaveValue("");
  });

  it("the checkbox reflects fieldValue() falling back to false when neither touched nor resolved sets it", () => {
    renderPanel({
      resolved: { ...RESOLVED, robots: { noindex: undefined as unknown as boolean, nofollow: false } },
      fieldValue: ((key: string) => (key === "noindex" ? undefined : false)) as SeoEntryPanelController["fieldValue"],
    });
    expect(screen.getByRole("checkbox", { name: "Noindex" })).not.toBeChecked();
  });

  it("shows the save error as role=alert", () => {
    renderPanel({ saveError: "failed to save SEO overrides" });
    expect(screen.getByRole("alert")).toHaveTextContent("failed to save SEO overrides");
  });

  it("shows the notice banner on successful save", () => {
    renderPanel({ notice: "Saved." });
    expect(screen.getByText("Saved.")).toBeInTheDocument();
  });

  it("'Save overrides' is disabled when nothing has been touched yet", () => {
    renderPanel({ touched: {} });
    expect(screen.getByRole("button", { name: "Save overrides" })).toBeDisabled();
  });

  it("'Save overrides' is enabled once at least one field is touched", () => {
    renderPanel({ touched: { title: "x" } });
    expect(screen.getByRole("button", { name: "Save overrides" })).toBeEnabled();
  });

  it("shows 'Saving…' and disables the button while saving, even if touched", () => {
    renderPanel({ touched: { title: "x" }, saving: true });
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("clicking 'Save overrides' calls save()", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async () => {});
    renderPanel({ touched: { title: "x" }, save });
    await user.click(screen.getByRole("button", { name: "Save overrides" }));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("does not render AnalyzePanel when analysis is null", () => {
    renderPanel({ analysis: null });
    expect(screen.queryByText("Analysis")).not.toBeInTheDocument();
  });
});

describe("AnalyzePanel (reached via SeoEntryPanel's analysis)", () => {
  function renderWithAnalysis(analysis: SeoEntryAnalysis | null) {
    seoEntrySectionRef.current = seoEntrySectionController({ entryId: "p1" });
    seoEntryPanelRef.current = seoEntryPanelController({ analysis });
    renderSeo();
  }

  it("renders the score", () => {
    renderWithAnalysis(ANALYSIS);
    expect(screen.getByText("82")).toBeInTheDocument();
  });

  it("shows 'No issues.' when the issue list is empty", () => {
    renderWithAnalysis({ ...ANALYSIS, issues: [] });
    expect(screen.getByText("No issues.")).toBeInTheDocument();
  });

  it("renders issues sorted error-first (via sortIssuesBySeverity)", () => {
    renderWithAnalysis(ANALYSIS);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("no-canonical");
    expect(items[1]).toHaveTextContent("missing-alt");
  });

  it("shows the field name in parens when an issue has one, omits it when not", () => {
    renderWithAnalysis(ANALYSIS);
    expect(screen.getByText("(body)")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    // no-canonical has no `field` — its own list item text should not contain a parenthetical.
    expect(items.find((li) => li.textContent?.includes("no-canonical"))?.textContent).not.toMatch(/\(.*\)/);
  });

  it("maps severity to the matching status class: error->failure, warning->unavailable, info->success", () => {
    renderWithAnalysis({
      ...ANALYSIS,
      issues: [
        { code: "e", severity: "error", message: "m" },
        { code: "w", severity: "warning", message: "m" },
        { code: "i", severity: "info", message: "m" },
      ],
    });
    expect(document.querySelector(".status-failure")).toBeInTheDocument();
    expect(document.querySelector(".status-unavailable")).toBeInTheDocument();
    expect(document.querySelector(".status-success")).toBeInTheDocument();
  });
});

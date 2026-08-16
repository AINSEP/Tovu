import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SourceControl } from "../SourceControl";
import type { SourceControlCredentialRowState, SourceControlCredentialsController } from "../hooks/use-source-control-credentials.hooks";
import type { AdminSourceControlCredentialSummary, AdminSourceControlProviderId } from "../../../lib/api";
import { SOURCE_CONTROL_PROVIDERS } from "../rules";

/**
 * @file `SourceControl`, driven through its one `useSourceControlCredentialsHook` DI seam — same
 * fixture-controller convention `StaticSiteTab.unit.test.tsx` established for
 * `usePublishCredentialsHook`. The hook's own load/save mechanics are
 * `use-source-control-credentials.unit.test.tsx`'s job, not this file's — this file only proves the
 * component renders the right markup for each row state, and pins the two defects this page was
 * briefed NOT to inherit from the Static Site tab's own credential rows: a bare, affordance-less
 * collapsed row, and "updated" wording on a saved-credential timestamp.
 *
 * 2026-08-16 density pass: every row is now a `<details>` (not just the connected one), sharing one
 * exclusive `name="source-control-provider"` accordion group — see `ProvidersTab.tsx`'s own header
 * for why. The old "a not-yet-connected row has no <details> at all" assertion is gone because that
 * is no longer true by design, not because it was stale. New coverage below proves the accordion's
 * default-open logic instead. Assertions here lean on the `open` ATTRIBUTE (a real DOM attribute,
 * observable regardless of jsdom's own rendering fidelity) rather than on content visibility where
 * the two diverge, for the same reason the pre-existing connected-row tests already open a row via
 * `user.click` before querying inside it.
 */

const fakeT = (key: string): string => key;

function credentialRowFixture(
  providerId: AdminSourceControlProviderId,
  overrides: Partial<SourceControlCredentialRowState> = {}
): SourceControlCredentialRowState {
  return { providerId, saved: undefined, token: "", username: "", saving: false, error: null, ...overrides };
}

function savedCredential(overrides: Partial<AdminSourceControlCredentialSummary> = {}): AdminSourceControlCredentialSummary {
  return {
    id: "cred-1",
    providerId: "github",
    label: "default",
    configured: true,
    isDefault: true,
    createdAt: "2026-08-15T09:30:00.000Z",
    updatedAt: "2026-08-15T09:30:00.000Z",
    ...overrides,
  };
}

type ControllerFixtureOverrides = Partial<Omit<SourceControlCredentialsController, "rows">> & {
  rows?: SourceControlCredentialRowState[];
  rowOverrides?: Partial<Record<AdminSourceControlProviderId, Partial<SourceControlCredentialRowState>>>;
};

function controllerFixture(overrides: ControllerFixtureOverrides = {}): SourceControlCredentialsController {
  // `"rows" in overrides` rather than `rows ?? <default>` — a caller explicitly passing
  // `rows: undefined` (to simulate the loading state) must NOT fall through to the default array,
  // which is exactly what `??` would do since it can't tell "not passed" apart from "passed as
  // undefined". Destructuring first, THEN checking presence on the original object, keeps both
  // cases distinguishable.
  const hasExplicitRows = "rows" in overrides;
  const { rows, rowOverrides, ...rest } = overrides;
  return {
    rows: hasExplicitRows ? rows : SOURCE_CONTROL_PROVIDERS.map((provider) => credentialRowFixture(provider.id, rowOverrides?.[provider.id])),
    loadError: null,
    setToken: vi.fn(),
    setUsername: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    t: fakeT,
    ...rest,
  };
}

function renderPage(overrides: ControllerFixtureOverrides = {}, props: { tabId?: string | null } = {}) {
  return render(<SourceControl tabId={props.tabId} useSourceControlCredentialsHook={() => controllerFixture(overrides)} />);
}

describe("SourceControl — page shell: tabbed like Deployment, not a bare settings-style card", () => {
  it("renders a page header (Operations kicker, Source Control title) above a TabBar", () => {
    renderPage();
    expect(screen.getByText("Operations")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Source Control" })).toBeInTheDocument();
  });

  it("shows exactly one active Providers tab in the TabBar", () => {
    renderPage();
    const tablist = screen.getByRole("tablist");
    const providersTab = within(tablist).getByRole("tab", { name: /Providers/ });
    expect(providersTab).toHaveAttribute("aria-selected", "true");
    expect(within(tablist).getAllByRole("tab")).toHaveLength(1);
  });

  it("falls back to the Providers tab for an absent or unrecognized ?tab= value", () => {
    renderPage({}, { tabId: "not-a-real-tab" });
    expect(screen.getByRole("tab", { name: /Providers/ })).toHaveAttribute("aria-selected", "true");
  });
});

describe("SourceControl — loading and error states", () => {
  it("shows a loading line before rows resolve", () => {
    renderPage({ rows: undefined });
    expect(screen.getByText("Loading connections…")).toBeInTheDocument();
  });

  it("shows the load error instead of any rows when the initial load failed", () => {
    renderPage({ rows: undefined, loadError: "Could not load source control connections (network down)." });
    expect(screen.getByRole("status")).toHaveTextContent("Could not load source control connections (network down).");
    expect(screen.queryByText("Loading connections…")).not.toBeInTheDocument();
  });
});

describe("SourceControl — Providers tab: three flat provider rows, not sub-tabs", () => {
  it("renders one row per provider, GitHub first", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /Connect GitHub/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Connect GitLab/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Connect Bitbucket/ })).toBeInTheDocument();
  });

  it("shows Bitbucket's extra Username field but not GitHub's or GitLab's, once each row is open", async () => {
    const user = userEvent.setup();
    renderPage();
    const headings = screen.getAllByRole("heading", { level: 3 });
    const bitbucketHeading = headings.find((h) => h.textContent?.includes("Bitbucket"))!;
    const bitbucketRow = bitbucketHeading.closest(".source-control-row")!;
    // Bitbucket is not the first unconnected provider (GitHub is), so it starts collapsed — open it
    // by clicking its own summary before looking for its fields, same dance the connected-row tests
    // below already use for a collapsed row.
    await user.click(bitbucketHeading);
    expect(within(bitbucketRow).getByLabelText("Username")).toBeInTheDocument();

    // GitHub is the first unconnected provider, so it is open by default — no click needed.
    const githubRow = headings.find((h) => h.textContent?.includes("GitHub"))!.closest(".source-control-row")!;
    expect(within(githubRow).queryByLabelText("Username")).not.toBeInTheDocument();
  });

  it("Save stays disabled until the row's required fields are filled in, then calls save(providerId)", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    const setToken = vi.fn();
    renderPage({ save, setToken, rowOverrides: { github: { token: "ghp_abc" } } });

    const githubHeading = screen.getByRole("heading", { name: /Connect GitHub/ });
    const githubRow = githubHeading.closest(".source-control-row")!;
    const saveButton = within(githubRow).getByRole("button", { name: "Save" });
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);
    expect(save).toHaveBeenCalledWith("github");
  });

  it("disables Save for a not-ready row (blank token)", () => {
    renderPage();
    const githubHeading = screen.getByRole("heading", { name: /Connect GitHub/ });
    const githubRow = githubHeading.closest(".source-control-row")!;
    expect(within(githubRow).getByRole("button", { name: "Save" })).toBeDisabled();
  });
});

describe("SourceControl — connected row: the two defects this page must NOT inherit", () => {
  it('says "saved", never "updated", next to a connected credential\'s timestamp', () => {
    renderPage({ rowOverrides: { github: { saved: savedCredential() } } });
    const summary = screen.getByText(/token stored, encrypted/).closest("summary")!;
    expect(summary).toHaveTextContent("saved 2026-08-15 09:30");
    expect(summary.textContent).not.toMatch(/\bupdated\b/i);
  });

  it("gives a connected row a VISIBLE expand affordance — a text label, not just a bare clickable row", () => {
    renderPage({ rowOverrides: { github: { saved: savedCredential() } } });
    const summary = screen.getByText(/token stored, encrypted/).closest("summary")!;
    // "Replace token" must be visible TEXT inside the summary, not merely implied by the row being
    // clickable — this is the exact fix for the owner-reported defect (a stripped native disclosure
    // triangle with nothing put in its place, so a settled row read as inert).
    expect(within(summary).getByText("Replace token")).toBeInTheDocument();
  });

  it("collapses a connected row behind <details>, closed by default (no `open` attribute)", () => {
    // A native `<details>`'s closed-state content stays in the DOM tree (the browser hides it via
    // layout, not by removing the nodes), so the meaningful assertion here is the `open` attribute
    // itself — the follow-on test below proves the fields are reachable once a user actually
    // expands it.
    renderPage({ rowOverrides: { github: { saved: savedCredential() } } });
    const details = screen.getByText(/token stored, encrypted/).closest("details")!;
    expect(details).not.toHaveAttribute("open");
  });

  it("reveals the replace-token fields once the connected row is expanded by the user", async () => {
    const user = userEvent.setup();
    renderPage({ rowOverrides: { github: { saved: savedCredential() } } });
    const summary = screen.getByText(/token stored, encrypted/).closest("summary")!;
    await user.click(summary);
    const details = summary.closest("details")!;
    expect(details).toHaveAttribute("open");
    expect(within(details).getByLabelText("Access token")).toBeInTheDocument();
    expect(within(details).getByText("Leave blank to keep the current token.")).toBeInTheDocument();
  });

  it("shows no token-liveness or verification indicator anywhere on a connected row", () => {
    renderPage({ rowOverrides: { github: { saved: savedCredential() } } });
    const summary = screen.getByText(/token stored, encrypted/).closest("summary")!;
    expect(summary.textContent).not.toMatch(/valid|verified|expired|live/i);
  });

  it("a not-yet-connected row IS a <details>, open by default when it is the first unconnected provider", () => {
    renderPage();
    const githubHeading = screen.getByRole("heading", { name: /Connect GitHub/ });
    const details = githubHeading.closest("details")!;
    expect(details).not.toBeNull();
    expect(details).toHaveAttribute("open");
    const githubRow = githubHeading.closest(".source-control-row")!;
    expect(within(githubRow).getByLabelText("Access token")).toBeInTheDocument();
  });
});

describe("SourceControl — accordion: one exclusive group, not three open forms at once", () => {
  it("opens only the first not-yet-connected provider (GitHub) by default, collapsing GitLab and Bitbucket", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /Connect GitHub/ }).closest("details")).toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: /Connect GitLab/ }).closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: /Connect Bitbucket/ }).closest("details")).not.toHaveAttribute("open");
  });

  it("shares one exclusive-accordion group name across all three rows, connected or not", () => {
    renderPage({ rowOverrides: { github: { saved: savedCredential() } } });
    const githubDetails = screen.getByText(/token stored, encrypted/).closest("details")!;
    const gitlabDetails = screen.getByRole("heading", { name: /Connect GitLab/ }).closest("details")!;
    const bitbucketDetails = screen.getByRole("heading", { name: /Connect Bitbucket/ }).closest("details")!;
    for (const details of [githubDetails, gitlabDetails, bitbucketDetails]) {
      expect(details).toHaveAttribute("name", "source-control-provider");
    }
  });

  it("reveals a collapsed not-yet-connected row's fields once the reader opens it", async () => {
    const user = userEvent.setup();
    renderPage();
    const gitlabHeading = screen.getByRole("heading", { name: /Connect GitLab/ });
    const details = gitlabHeading.closest("details")!;
    expect(details).not.toHaveAttribute("open");
    await user.click(gitlabHeading);
    expect(details).toHaveAttribute("open");
    expect(within(details).getByLabelText("Access token")).toBeInTheDocument();
  });

  it("defaults open to the next unconnected provider once the first one is connected", () => {
    renderPage({ rowOverrides: { github: { saved: savedCredential() } } });
    const githubDetails = screen.getByText(/token stored, encrypted/).closest("details")!;
    expect(githubDetails).not.toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: /Connect GitLab/ }).closest("details")).toHaveAttribute("open");
  });

  it("opens no row by default once every provider is already connected", () => {
    renderPage({
      rowOverrides: {
        github: { saved: savedCredential({ providerId: "github" }) },
        gitlab: { saved: savedCredential({ providerId: "gitlab" }) },
        bitbucket: { saved: savedCredential({ providerId: "bitbucket" }) },
      },
    });
    for (const row of document.querySelectorAll(".source-control-row")) {
      expect(row).not.toHaveAttribute("open");
    }
  });
});

describe("SourceControl — scope guidance: reachable behind its own disclosure, not shown by default", () => {
  it("hides the scope-guidance sentence and its Create-a-token link until the reader opens the disclosure", async () => {
    const user = userEvent.setup();
    renderPage();
    // GitHub is open by default (first unconnected provider), so its own nested scope-guidance
    // <details> is reachable but starts collapsed — asserted on the `open` attribute itself (a real
    // DOM attribute) rather than on query visibility, since jsdom does not apply the native
    // closed-<details>-hides-its-content rendering behavior the way a real browser does; the
    // pre-existing connected-row tests above make the identical choice for the outer accordion.
    // Scoped to GitHub's own row — jsdom does not hide the other two (closed) rows' identical
    // "Which token do I need?" summaries from a plain `getByText`, so an unscoped query here would
    // ambiguously match all three.
    const githubDetails = screen.getByRole("heading", { name: /Connect GitHub/ }).closest("details")!;
    const guidanceSummary = within(githubDetails).getByText("Which token do I need?");
    const guidanceDetails = guidanceSummary.closest("details")!;
    expect(guidanceDetails).not.toHaveAttribute("open");
    await user.click(guidanceSummary);
    expect(guidanceDetails).toHaveAttribute("open");
    expect(within(guidanceDetails).getByText(/fine-grained personal access token/)).toBeInTheDocument();
    expect(within(guidanceDetails).getByRole("link", { name: "Create a token" })).toBeInTheDocument();
  });

  it("no longer renders the old per-row subtitle repeated identically on all three rows", () => {
    renderPage();
    expect(screen.queryByText("Save a personal access token so Tovu can use this account.")).not.toBeInTheDocument();
  });
});

describe("SourceControl — scope boundary copy", () => {
  it("states this is a connection page, not git integration, in the page header", () => {
    renderPage();
    expect(
      screen.getByText(/doesn't turn your content into git-versioned files — that's a separate feature, not built yet\./)
    ).toBeInTheDocument();
  });
});

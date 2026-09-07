import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/lib/fetch-query";
import { AccessTokensTab } from "../AccessTokensTab";
import { accessTokenProviderInfo, accessTokenRowProviderInfo } from "../rules";
import type { AccessTokenKind, AccessTokenRow } from "../rules";
import type {
  AccessTokenAddFormState,
  AccessTokenExistingRowState,
  AccessTokenProviderGroupState,
  AccessTokensController,
} from "../hooks/use-access-tokens.hooks";
import type { OtherCredentialsController } from "../hooks/use-other-credentials.hooks";

/**
 * @file (2026-09-04 coverage pass) `AccessTokensTab.tsx` was at 55% line / 52% branch coverage —
 * `AccessTokensTab.unit.test.tsx`/`access-tokens-revoke-copy.unit.test.tsx` only ever render this
 * page with `groups: []`, so every actual credential-row component (`ProviderGroup`, `TokenRow`,
 * `NotConnectedRow`, `AddAnotherButton`, `AddTokenForm`, `ExistingTokenFields`, `TokenInputFields`,
 * `RemoveConfirmDialog`, `AddCustomCredentialDialog`, `AdditionalHostsField`) never actually
 * mounted. This file drives all of those directly off a hand-built `AccessTokensController`
 * fixture (same convention `access-tokens-revoke-copy.unit.test.tsx`'s own `makeAccessTokens`
 * establishes), asserting dispatch to the controller's own spies rather than re-testing `rules.ts`'s
 * pure functions (that's `rules.unit.test.ts`'s job) or the controller's own state transitions
 * (that's `use-access-tokens.unit.test.tsx`'s job).
 *
 * jsdom does not implement `HTMLDialogElement.prototype.showModal`/`.close` — polyfilled below,
 * same as `OtherCredentialsSection.unit.test.tsx`'s own header documents. `css: false` in this
 * repo's `vitest.config.ts` means a closed `<details>`'s content is never hidden the way a real
 * browser's UA stylesheet would hide it, so every row's fields are directly queryable without
 * first clicking "Replace token" to expand it — same reasoning `StaticSiteTab.unit.test.tsx`'s own
 * `<details>` suites already rely on.
 */
if (typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
}
if (typeof HTMLDialogElement.prototype.close !== "function") {
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}

function makeAccessTokens(overrides: Partial<AccessTokensController> = {}): AccessTokensController {
  return {
    groups: [],
    loadError: null,
    query: "",
    setQuery: vi.fn(),
    category: "all",
    setCategory: vi.fn(),
    totalCount: 0,
    matchCount: 0,
    setExistingField: vi.fn(),
    replaceToken: vi.fn().mockResolvedValue(undefined),
    removeToken: vi.fn().mockResolvedValue(undefined),
    makeDefault: vi.fn().mockResolvedValue(undefined),
    openAddForm: vi.fn(),
    closeAddForm: vi.fn(),
    setAddField: vi.fn(),
    createToken: vi.fn().mockResolvedValue(undefined),
    customAddForm: { name: "", category: "general", baseUrl: "", additionalHosts: "", token: "", username: "", saving: false, error: null },
    setCustomAddField: vi.fn(),
    resetCustomAddForm: vi.fn(),
    createCustomCredential: vi.fn().mockResolvedValue(false),
    t: (key: string) => key,
    ...overrides,
  };
}

function makeOtherCredentials(overrides: Partial<OtherCredentialsController> = {}): OtherCredentialsController {
  return {
    groups: [],
    loadError: null,
    totalCount: 0,
    matchCount: 0,
    setDraftToken: vi.fn(),
    replace: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    t: (key: string) => key,
    ...overrides,
  };
}

function row(overrides: Partial<AccessTokenRow> = {}): AccessTokenRow {
  return {
    kind: "publish",
    providerId: "netlify",
    id: "row-1",
    name: "Production",
    rawLabel: "Production",
    isDefault: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function rowState(overrides: Partial<AccessTokenExistingRowState> = {}): AccessTokenExistingRowState {
  return {
    row: row(),
    name: "Production",
    token: "",
    accountId: "",
    username: "",
    saving: false,
    error: null,
    ...overrides,
  };
}

function addForm(overrides: Partial<AccessTokenAddFormState> = {}): AccessTokenAddFormState {
  return { visible: false, name: "", token: "", accountId: "", username: "", saving: false, error: null, ...overrides };
}

/** Builds one provider group — for `kind: "custom"`, `info` is the row's own SYNTHETIC info
 *  (`accessTokenRowProviderInfo`), matching what `useAccessTokens`'s real `customGroups` builds;
 *  `accessTokenProviderInfo` alone would silently fall back to GitHub Pages for a `providerId` not
 *  in the seven-provider catalog. */
function groupFor(
  kind: AccessTokenKind,
  providerId: string,
  rows: AccessTokenExistingRowState[] = [],
  addFormState: AccessTokenAddFormState = addForm()
): AccessTokenProviderGroupState {
  const info = kind === "custom" && rows[0] ? accessTokenRowProviderInfo(rows[0].row) : accessTokenProviderInfo({ kind, providerId });
  return { info, rows, addForm: addFormState };
}

function renderTab(overrides: Partial<AccessTokensController> = {}, otherOverrides: Partial<OtherCredentialsController> = {}) {
  return render(<AccessTokensTab useAccessTokensHook={() => makeAccessTokens(overrides)} useOtherCredentialsHook={() => makeOtherCredentials(otherOverrides)} />);
}

describe("AccessTokensTab — loading and error states", () => {
  it("shows the loading placeholder until both tiers' groups resolve", () => {
    renderTab({ groups: undefined });
    expect(screen.getByText("Loading access tokens…")).toBeInTheDocument();
  });

  it("shows the access-tokens load error and renders nothing else", () => {
    renderTab({ loadError: "Couldn't load saved access tokens: network down" });
    expect(screen.getByText("Couldn't load saved access tokens: network down")).toBeInTheDocument();
    expect(screen.queryByLabelText("Search access tokens")).not.toBeInTheDocument();
  });

  it("shows the other-credentials load error even when access tokens loaded fine", () => {
    renderTab({}, { loadError: "Couldn't load saved credentials: network down" });
    expect(screen.getByText("Couldn't load saved credentials: network down")).toBeInTheDocument();
  });
});

describe("AccessTokensTab — category filter and Add custom provider", () => {
  it("clicking a category pill calls setCategory with that category's id", () => {
    const setCategory = vi.fn();
    renderTab({ setCategory });
    fireEvent.click(screen.getByRole("tab", { name: "Hosting" }));
    expect(setCategory).toHaveBeenCalledWith("hosting");
  });

  it("marks the active category tab aria-selected, and every other tab not selected", () => {
    renderTab({ category: "media" });
    expect(screen.getByRole("tab", { name: "Media" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "false");
  });

  it("clicking '+ Add custom provider' opens the custom-credential dialog", () => {
    const { container } = renderTab();
    fireEvent.click(screen.getByRole("button", { name: "+ Add custom provider" }));
    expect(container.querySelector("dialog.access-tokens-add-custom-dialog")).toHaveAttribute("open");
  });

  // Same aria-labelledby regression as the Remove confirm dialog above, for this page's other
  // hand-rolled native `<dialog>`.
  it("the add-custom-provider dialog's accessible name comes from aria-labelledby pointing at its own <h2>", () => {
    const { container } = renderTab();
    fireEvent.click(screen.getByRole("button", { name: "+ Add custom provider" }));
    const dialog = container.querySelector("dialog.access-tokens-add-custom-dialog")!;
    const titleId = dialog.getAttribute("aria-labelledby");
    expect(titleId).toBeTruthy();
    const title = container.querySelector(`#${titleId}`);
    expect(title).not.toBeNull();
    expect(title!.tagName).toBe("H2");
    expect(title!.textContent).toBe("Add custom provider");
  });
});

describe("AccessTokensTab — search box", () => {
  it("typing calls setQuery with the new value", () => {
    const setQuery = vi.fn();
    renderTab({ setQuery });
    fireEvent.change(screen.getByLabelText("Search access tokens"), { target: { value: "git" } });
    expect(setQuery).toHaveBeenCalledWith("git");
  });

  it("shows the total-saved count line when no query is active", () => {
    renderTab({ totalCount: 3 }, { totalCount: 1 });
    expect(screen.getByText("4 tokens saved")).toBeInTheDocument();
  });

  it("shows the matching-count line, summed across both tiers, when a query is active", () => {
    renderTab({ query: "git", totalCount: 5, matchCount: 2 }, { totalCount: 1, matchCount: 1 });
    expect(screen.getByText("3 of 6 tokens matching “git”")).toBeInTheDocument();
  });
});

describe("AccessTokensTab — MaybeProviderGroup: search visibility", () => {
  it("hides a provider with zero rows whose own label/purpose does not match the query", () => {
    renderTab({ groups: [groupFor("publish", "netlify")], query: "zzz-no-match" });
    expect(screen.queryByText("Netlify")).not.toBeInTheDocument();
  });

  it("still shows a provider with zero rows when the query matches its own label", () => {
    renderTab({ groups: [groupFor("publish", "netlify")], query: "netlify" });
    expect(screen.getByText("Netlify")).toBeInTheDocument();
  });

  it("shows a provider whose rows already matched the query upstream, even when its own label does not", () => {
    const target = rowState({ row: row({ name: "Prod" }) });
    const { container } = renderTab({ groups: [groupFor("publish", "netlify", [target])], query: "prod" });
    // Not `getByText("Netlify")` — the row's own `AddAnotherButton`/`RemoveConfirmDialog` (always in
    // the DOM once a row exists, per this file's own header) ALSO render "Netlify" as plain text, so
    // a global text query is ambiguous here. The provider heading is the one thing this test needs.
    expect(container.querySelector(".access-tokens-provider-heading")).toBeInTheDocument();
  });
});

describe("AccessTokensTab — ProviderGroup: not-connected vs connected vs add-form states", () => {
  it("shows 'Not connected' with a Connect button when a provider has no saved rows and no add form open", () => {
    const openAddForm = vi.fn();
    renderTab({ groups: [groupFor("publish", "netlify")], openAddForm });
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    // Accessible name includes the provider label ("Connect Netlify"), not a bare "Connect" — see
    // `NotConnectedRow`'s own `aria-label` comment for why: with 2+ not-connected providers on
    // screen, a bare "Connect" would be ambiguous.
    fireEvent.click(screen.getByRole("button", { name: "Connect Netlify" }));
    expect(openAddForm).toHaveBeenCalledWith({ kind: "publish", providerId: "netlify" });
  });

  it("renders '[+ Add another]' for a connected catalog provider with its add form closed, and it calls openAddForm", () => {
    const openAddForm = vi.fn();
    const target = rowState({ row: row() });
    renderTab({ groups: [groupFor("publish", "netlify", [target])], openAddForm });
    fireEvent.click(screen.getByRole("button", { name: "Add another Netlify token" }));
    expect(openAddForm).toHaveBeenCalledWith({ kind: "publish", providerId: "netlify" });
  });

  it("never renders '[+ Add another]' for a custom credential group, connected or not", () => {
    const target = rowState({ row: row({ kind: "custom", providerId: "custom-1", id: "custom-1", name: "fly.io deploy" }) });
    renderTab({ groups: [groupFor("custom", "custom-1", [target])] });
    expect(screen.queryByRole("button", { name: /Add another/ })).not.toBeInTheDocument();
  });

  it("renders the add-token form instead of 'Not connected' once the add form is visible", () => {
    renderTab({ groups: [groupFor("publish", "netlify", [], addForm({ visible: true }))] });
    expect(screen.queryByText("Not connected")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("hides 'Not connected' once the add form is open even with zero saved rows (no double affordance)", () => {
    renderTab({ groups: [groupFor("publish", "netlify", [], addForm({ visible: true }))] });
    expect(screen.queryByText("Not connected")).not.toBeInTheDocument();
  });
});

describe("AccessTokensTab — TokenRow: default indicator and Make default", () => {
  it("shows no default indicator or 'Make default' link when the provider has only one saved row", () => {
    renderTab({ groups: [groupFor("publish", "netlify", [rowState()])] });
    expect(screen.queryByText("Default")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Make .* the default token/ })).not.toBeInTheDocument();
  });

  it("shows 'Default' as static text for the default row, and a working 'Make default' link on the other, once a provider has 2+ rows", () => {
    const makeDefault = vi.fn().mockResolvedValue(undefined);
    const rows = [rowState({ row: row({ id: "row-1", isDefault: true, name: "Production" }), name: "Production" }), rowState({ row: row({ id: "row-2", isDefault: false, name: "Staging" }), name: "Staging" })];
    renderTab({ groups: [groupFor("publish", "netlify", rows)], makeDefault });

    expect(screen.getByText("Default")).toBeInTheDocument();
    // Accessible name is "Make default — Staging", not a bare "Make default" — with 3+ saved rows
    // for one provider, more than one non-default row would otherwise render identically.
    fireEvent.click(screen.getByRole("button", { name: "Make default — Staging" }));
    expect(makeDefault).toHaveBeenCalledWith(rows[1]!.row);
  });
});

describe("AccessTokensTab — ExistingTokenFields: Save/Remove and error rendering", () => {
  it("disables Save until the replace form is ready (unchanged name, blank token)", () => {
    renderTab({ groups: [groupFor("publish", "netlify", [rowState({ row: row() })])] });
    // Accessible name is "Save — Production" (the row's own name), not a bare "Save" — see
    // `ExistingTokenFields`' own `aria-label` comment for why: more than one saved row can have its
    // `<details>` open at once.
    expect(screen.getByRole("button", { name: "Save — Production" })).toBeDisabled();
  });

  it("clicking Save calls replaceToken with this row once a token has been typed", () => {
    const replaceToken = vi.fn().mockResolvedValue(undefined);
    const target = rowState({ row: row(), token: "ghp_new" });
    renderTab({ groups: [groupFor("publish", "netlify", [target])], replaceToken });

    const saveButton = screen.getByRole("button", { name: "Save — Production" });
    expect(saveButton).not.toBeDisabled();
    fireEvent.click(saveButton);

    expect(replaceToken).toHaveBeenCalledWith(target.row);
  });

  it("shows 'Saving…' and disables Save while a save is in flight", () => {
    const target = rowState({ row: row(), token: "ghp_new", saving: true });
    renderTab({ groups: [groupFor("publish", "netlify", [target])] });
    expect(screen.getByRole("button", { name: "Saving… — Production" })).toBeDisabled();
  });

  it("shows the row's own save-error alert when present", () => {
    const target = rowState({ row: row(), error: "Couldn't save this token: network down" });
    renderTab({ groups: [groupFor("publish", "netlify", [target])] });
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save this token: network down");
  });

  it("shows no alert when the row has no error", () => {
    renderTab({ groups: [groupFor("publish", "netlify", [rowState({ row: row() })])] });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("typing into Name/Token calls setExistingField for this row", () => {
    const setExistingField = vi.fn();
    renderTab({ groups: [groupFor("publish", "netlify", [rowState({ row: row({ id: "row-1" }) })])], setExistingField });

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Prod 2" } });
    expect(setExistingField).toHaveBeenCalledWith("row-1", { name: "Prod 2" });

    fireEvent.change(screen.getByLabelText("Access token"), { target: { value: "ghp_new" } });
    expect(setExistingField).toHaveBeenCalledWith("row-1", { token: "ghp_new" });
  });

  it("typing into Account ID calls setExistingField for this row (Cloudflare Pages' own required field)", () => {
    const setExistingField = vi.fn();
    renderTab({ groups: [groupFor("publish", "cloudflare-pages", [rowState({ row: row({ id: "row-1", providerId: "cloudflare-pages" }) })])], setExistingField });

    fireEvent.change(screen.getByLabelText("Account ID"), { target: { value: "acct-9" } });
    expect(setExistingField).toHaveBeenCalledWith("row-1", { accountId: "acct-9" });
  });

  it("typing into Username calls setExistingField for this row (Bitbucket's own required field)", () => {
    const setExistingField = vi.fn();
    const { container } = renderTab({
      groups: [groupFor("source-control", "bitbucket", [rowState({ row: row({ id: "row-1", kind: "source-control", providerId: "bitbucket" }) })])],
      setExistingField,
    });

    const group = container.querySelector('[data-agent-element="security-access-tokens-group-source-control-bitbucket"]') as HTMLElement;
    fireEvent.change(within(group).getByLabelText("Username"), { target: { value: "bb-user" } });
    expect(setExistingField).toHaveBeenCalledWith("row-1", { username: "bb-user" });
  });

  it("clicking Remove from Tovu opens the confirm dialog", () => {
    const { container } = renderTab({ groups: [groupFor("publish", "netlify", [rowState({ row: row() })])] });
    // Accessible name is "Remove from Tovu — Production" (the row's own name), not a bare "Remove
    // from Tovu" — see `ExistingTokenFields`' own `aria-label` comment for why.
    fireEvent.click(screen.getByRole("button", { name: "Remove from Tovu — Production" }));
    expect(container.querySelector("dialog.confirm-dialog")).toHaveAttribute("open");
  });

  // Regression: unlike a `RowMenu`'s dropdown items (only ever one open at a time), a provider
  // group can have more than one saved token, each with its own independent `<details>` — so a
  // provider with two saved tokens puts two Save AND two Remove-from-Tovu buttons in the DOM at
  // once. Before `state.name` was appended, both pairs read identically ("Save"/"Remove from
  // Tovu"), so nothing distinguished which row a click would act on.
  it("gives each saved row's Save and Remove buttons DISTINCT accessible names when a provider has 2+ tokens", () => {
    const rows = [
      rowState({ row: row({ id: "row-1" }), name: "Production", token: "ghp_a" }),
      rowState({ row: row({ id: "row-2", isDefault: false }), name: "Staging", token: "ghp_b" }),
    ];
    renderTab({ groups: [groupFor("publish", "netlify", rows)] });

    expect(screen.getByRole("button", { name: "Save — Production" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save — Staging" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Save —/ })).toHaveLength(2);

    expect(screen.getByRole("button", { name: "Remove from Tovu — Production" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove from Tovu — Staging" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Remove from Tovu —/ })).toHaveLength(2);
  });

  // Regression: this native `<dialog>` used to carry no `aria-labelledby` at all, so it had no
  // accessible name (a bare, unnamed "dialog" role) despite showing a real, informative `<h2>` —
  // the same relationship the shared `ConfirmDialog` (`@jini-ai/admin/react`) already draws via its
  // own `titleId`. Asserted structurally (the `id`/`aria-labelledby` link), not just "an h2 exists
  // somewhere" — the link is what actually makes the title reach the accessible name.
  it("the confirm dialog's accessible name comes from aria-labelledby pointing at its own <h2>", () => {
    const { container } = renderTab({ groups: [groupFor("publish", "netlify", [rowState({ row: row() })])] });
    fireEvent.click(screen.getByRole("button", { name: "Remove from Tovu — Production" }));
    const dialog = container.querySelector("dialog.confirm-dialog")!;
    const titleId = dialog.getAttribute("aria-labelledby");
    expect(titleId).toBeTruthy();
    const title = container.querySelector(`#${titleId}`);
    expect(title).not.toBeNull();
    expect(title!.tagName).toBe("H2");
  });
});

describe("AccessTokensTab — AddTokenForm: Save/Cancel", () => {
  it("typing into Name calls setAddField with this provider's ref", () => {
    const setAddField = vi.fn();
    renderTab({ groups: [groupFor("publish", "netlify", [], addForm({ visible: true }))], setAddField });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Prod" } });
    expect(setAddField).toHaveBeenCalledWith({ kind: "publish", providerId: "netlify" }, { name: "Prod" });
  });

  it("disables Save until ready, and clicking Save (once ready) calls createToken with this provider's ref", () => {
    const createToken = vi.fn().mockResolvedValue(undefined);
    renderTab({ groups: [groupFor("publish", "netlify", [], addForm({ visible: true, name: "Prod", token: "tok" }))], createToken });

    // Accessible name is "Save — Netlify" (the provider label — this token has no name of its own
    // yet), not a bare "Save" — see `AddTokenForm`'s own `aria-label` comment for why: more than
    // one provider's add form can be open at once.
    const saveButton = screen.getByRole("button", { name: "Save — Netlify" });
    expect(saveButton).not.toBeDisabled();
    fireEvent.click(saveButton);

    expect(createToken).toHaveBeenCalledWith({ kind: "publish", providerId: "netlify" });
  });

  it("disables Save while the add form has nothing typed yet", () => {
    renderTab({ groups: [groupFor("publish", "netlify", [], addForm({ visible: true }))] });
    expect(screen.getByRole("button", { name: "Save — Netlify" })).toBeDisabled();
  });

  it("clicking Cancel calls closeAddForm with this provider's ref", () => {
    const closeAddForm = vi.fn();
    renderTab({ groups: [groupFor("publish", "netlify", [], addForm({ visible: true }))], closeAddForm });
    fireEvent.click(screen.getByRole("button", { name: "Cancel adding this Netlify token" }));
    expect(closeAddForm).toHaveBeenCalledWith({ kind: "publish", providerId: "netlify" });
  });

  it("shows the add-form's own save-error alert when present", () => {
    renderTab({ groups: [groupFor("publish", "netlify", [], addForm({ visible: true, error: 'A token named "Prod" already exists for Netlify.' }))] });
    expect(screen.getByRole("alert")).toHaveTextContent('A token named "Prod" already exists for Netlify.');
  });

  it("shows 'Saving…' and disables Save while a create is in flight", () => {
    renderTab({ groups: [groupFor("publish", "netlify", [], addForm({ visible: true, name: "Prod", token: "tok", saving: true }))] });
    expect(screen.getByRole("button", { name: "Saving… — Netlify" })).toBeDisabled();
  });
});

describe("AccessTokensTab — TokenInputFields: provider-specific extra fields", () => {
  it("shows Account ID for Cloudflare Pages (a required field) and calls setAddField when typed into", () => {
    const setAddField = vi.fn();
    renderTab({ groups: [groupFor("publish", "cloudflare-pages", [], addForm({ visible: true }))], setAddField });
    const field = screen.getByLabelText("Account ID");
    expect(field).toBeInTheDocument();
    fireEvent.change(field, { target: { value: "acct-123" } });
    expect(setAddField).toHaveBeenCalledWith({ kind: "publish", providerId: "cloudflare-pages" }, { accountId: "acct-123" });
  });

  it("does not show Account ID for a provider that doesn't require it", () => {
    renderTab({ groups: [groupFor("publish", "netlify", [], addForm({ visible: true }))] });
    expect(screen.queryByLabelText("Account ID")).not.toBeInTheDocument();
  });

  it("shows Username with Bitbucket-specific hint copy for a REQUIRED-username provider, and calls setAddField when typed into", () => {
    const setAddField = vi.fn();
    const { container } = renderTab({ groups: [groupFor("source-control", "bitbucket", [], addForm({ visible: true }))], setAddField });
    expect(screen.getByText("The Bitbucket username this API token belongs to.")).toBeInTheDocument();
    // Scoped to this provider's own group — the always-mounted `AddCustomCredentialDialog` (see
    // this file's own header) has its OWN "Username" field with the identical plain label text,
    // and `getByLabelText` does not exclude a closed `<dialog>`'s content the way `getByRole` does.
    const group = container.querySelector('[data-agent-element="security-access-tokens-group-source-control-bitbucket"]') as HTMLElement;
    fireEvent.change(within(group).getByLabelText("Username"), { target: { value: "me" } });
    expect(setAddField).toHaveBeenCalledWith({ kind: "source-control", providerId: "bitbucket" }, { username: "me" });
  });

  it("shows Username with generic optional-field hint copy for a custom credential's Replace form (optionalFields, not required)", () => {
    const target = rowState({ row: row({ kind: "custom", providerId: "custom-1", id: "custom-1", name: "fly.io deploy" }) });
    const { container } = renderTab({ groups: [groupFor("custom", "custom-1", [target])] });
    const group = container.querySelector('[data-agent-element="security-access-tokens-group-custom-custom-1"]') as HTMLElement;
    expect(within(group).getByLabelText("Username")).toBeInTheDocument();
    // Scoped for the same reason as `getByLabelText` above — the always-mounted
    // `AddCustomCredentialDialog` carries this exact hint sentence for its OWN Username field too.
    expect(within(group).getByText("Optional — only needed if this provider authenticates a token against a username.")).toBeInTheDocument();
  });

  it("typing into the Access token field calls onTokenChange (setAddField)", () => {
    const setAddField = vi.fn();
    renderTab({ groups: [groupFor("publish", "netlify", [], addForm({ visible: true }))], setAddField });
    fireEvent.change(screen.getByLabelText("Access token"), { target: { value: "tok-123" } });
    expect(setAddField).toHaveBeenCalledWith({ kind: "publish", providerId: "netlify" }, { token: "tok-123" });
  });
});

describe("AccessTokensTab — RemoveConfirmDialog: cancel/confirm and the last-row note", () => {
  it("Cancel closes the dialog without calling removeToken", () => {
    const removeToken = vi.fn().mockResolvedValue(undefined);
    const { container } = renderTab({ groups: [groupFor("publish", "netlify", [rowState({ row: row() })])], removeToken });

    fireEvent.click(screen.getByRole("button", { name: "Remove from Tovu — Production" }));
    const dialog = container.querySelector<HTMLDialogElement>("dialog.confirm-dialog")!;
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel", hidden: true }));

    expect(removeToken).not.toHaveBeenCalled();
    expect(dialog).not.toHaveAttribute("open");
  });

  it("confirming calls removeToken with this row and closes the dialog", () => {
    const removeToken = vi.fn().mockResolvedValue(undefined);
    const target = rowState({ row: row() });
    const { container } = renderTab({ groups: [groupFor("publish", "netlify", [target])], removeToken });

    fireEvent.click(screen.getByRole("button", { name: "Remove from Tovu — Production" }));
    const dialog = container.querySelector<HTMLDialogElement>("dialog.confirm-dialog")!;
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove from Tovu", hidden: true }));

    expect(removeToken).toHaveBeenCalledWith(target.row);
  });

  it("shows the last-saved-row note only when this is the only saved row for the provider", () => {
    const { container } = renderTab({ groups: [groupFor("publish", "netlify", [rowState({ row: row() })])] });
    fireEvent.click(screen.getByRole("button", { name: "Remove from Tovu — Production" }));
    expect(container.textContent).toMatch(/the only saved Netlify token/);
  });

  it("omits the last-saved-row note when the provider has more than one saved row", () => {
    const rows = [rowState({ row: row({ id: "row-1" }) }), rowState({ row: row({ id: "row-2", isDefault: false }), name: "Staging" })];
    const { container } = renderTab({ groups: [groupFor("publish", "netlify", rows)] });

    const row1 = container.querySelector('[data-agent-element="security-access-tokens-row-publish-netlify-row-1"]') as HTMLElement;
    // row-1 keeps the `rowState` fixture's default name ("Production") — see `ExistingTokenFields`'
    // own `aria-label` comment for why this control's accessible name now includes it.
    fireEvent.click(within(row1).getByRole("button", { name: "Remove from Tovu — Production" }));

    expect(within(row1).queryByText(/the only saved Netlify token/)).not.toBeInTheDocument();
  });
});

describe("AccessTokensTab — AddCustomCredentialDialog", () => {
  function openDialog(overrides: Partial<AccessTokensController> = {}) {
    const utils = renderTab(overrides);
    fireEvent.click(screen.getByRole("button", { name: "+ Add custom provider" }));
    return utils;
  }

  it("typing into each field calls setCustomAddField with just that field", () => {
    const setCustomAddField = vi.fn();
    openDialog({ setCustomAddField });

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "fly.io" } });
    expect(setCustomAddField).toHaveBeenCalledWith({ name: "fly.io" });

    fireEvent.change(screen.getByLabelText(/^API base URL/), { target: { value: "https://api.fly.io" } });
    expect(setCustomAddField).toHaveBeenCalledWith({ baseUrl: "https://api.fly.io" });

    fireEvent.change(screen.getByLabelText("Additional hosts"), { target: { value: "https://api.machines.dev" } });
    expect(setCustomAddField).toHaveBeenCalledWith({ additionalHosts: "https://api.machines.dev" });

    fireEvent.change(screen.getByLabelText(/^Access token/), { target: { value: "tok" } });
    expect(setCustomAddField).toHaveBeenCalledWith({ token: "tok" });

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "me" } });
    expect(setCustomAddField).toHaveBeenCalledWith({ username: "me" });

    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "ai" } });
    expect(setCustomAddField).toHaveBeenCalledWith({ category: "ai" });
  });

  it("shows an inline error for an invalid, non-blank base URL", () => {
    openDialog({ customAddForm: { name: "", category: "general", baseUrl: "not-a-url", additionalHosts: "", token: "", username: "", saving: false, error: null } });
    expect(screen.getByText("Enter a valid http:// or https:// URL.")).toBeInTheDocument();
  });

  it("shows no base-URL error while the field is still blank", () => {
    openDialog();
    expect(screen.queryByText("Enter a valid http:// or https:// URL.")).not.toBeInTheDocument();
  });

  it("shows no base-URL error for a valid, non-blank URL", () => {
    openDialog({ customAddForm: { name: "", category: "general", baseUrl: "https://api.fly.io", additionalHosts: "", token: "", username: "", saving: false, error: null } });
    expect(screen.queryByText("Enter a valid http:// or https:// URL.")).not.toBeInTheDocument();
  });

  it("shows an inline error for an invalid additional-hosts entry", () => {
    openDialog({ customAddForm: { name: "", category: "general", baseUrl: "", additionalHosts: "not-a-url", token: "", username: "", saving: false, error: null } });
    expect(screen.getByText("Each additional host must be a valid http:// or https:// URL.")).toBeInTheDocument();
  });

  it("toggles the access token field between masked and visible", () => {
    openDialog();
    const tokenInput = screen.getByLabelText(/^Access token/);
    expect(tokenInput).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(tokenInput).toHaveAttribute("type", "text");

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(tokenInput).toHaveAttribute("type", "password");
  });

  it("disables Save until the form is ready, and clicking Save (once ready) calls createCustomCredential", async () => {
    const createCustomCredential = vi.fn().mockResolvedValue(true);
    openDialog({
      createCustomCredential,
      customAddForm: { name: "fly.io", category: "general", baseUrl: "https://api.fly.io", additionalHosts: "", token: "tok", username: "", saving: false, error: null },
    });

    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).not.toBeDisabled();
    fireEvent.click(saveButton);

    await waitFor(() => expect(createCustomCredential).toHaveBeenCalledTimes(1));
  });

  it("disables Save while the form has nothing typed yet", () => {
    openDialog();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("closes the dialog on a successful save", async () => {
    const { container } = openDialog({
      createCustomCredential: vi.fn().mockResolvedValue(true),
      customAddForm: { name: "fly.io", category: "general", baseUrl: "https://api.fly.io", additionalHosts: "", token: "tok", username: "", saving: false, error: null },
    });
    const dialog = container.querySelector<HTMLDialogElement>("dialog.access-tokens-add-custom-dialog")!;

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
  });

  it("does NOT close the dialog when save fails (createCustomCredential resolves false)", async () => {
    const createCustomCredential = vi.fn().mockResolvedValue(false);
    const { container } = openDialog({
      createCustomCredential,
      customAddForm: { name: "fly.io", category: "general", baseUrl: "https://api.fly.io", additionalHosts: "", token: "tok", username: "", saving: false, error: null },
    });
    const dialog = container.querySelector<HTMLDialogElement>("dialog.access-tokens-add-custom-dialog")!;

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(createCustomCredential).toHaveBeenCalledTimes(1));

    expect(dialog).toHaveAttribute("open");
  });

  it("clicking Cancel closes the dialog and calls resetCustomAddForm", () => {
    const resetCustomAddForm = vi.fn();
    const { container } = openDialog({ resetCustomAddForm });
    const dialog = container.querySelector<HTMLDialogElement>("dialog.access-tokens-add-custom-dialog")!;

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(dialog).not.toHaveAttribute("open");
    expect(resetCustomAddForm).toHaveBeenCalledTimes(1);
  });

  it("shows the dialog's own save-error alert when present", () => {
    openDialog({ customAddForm: { name: "", category: "general", baseUrl: "", additionalHosts: "", token: "", username: "", saving: false, error: 'A token named "fly.io" already exists for this workspace.' } });
    expect(screen.getByRole("alert")).toHaveTextContent('A token named "fly.io" already exists for this workspace.');
  });

  it("shows 'Saving…' and disables Save while a save is in flight", () => {
    openDialog({ customAddForm: { name: "fly.io", category: "general", baseUrl: "https://api.fly.io", additionalHosts: "", token: "tok", username: "", saving: true, error: null } });
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });
});

describe("AccessTokensTab — default hook resolution (resolveAccessTokensHook/resolveOtherCredentialsHook's own real-binding fallback)", () => {
  it("falls back to the real useWiredAccessTokens when no override is passed, without crashing", () => {
    expect(() =>
      render(
        <FetchQueryProvider>
          <AccessTokensTab useOtherCredentialsHook={() => makeOtherCredentials()} />
        </FetchQueryProvider>
      )
    ).not.toThrow();
  });

  it("falls back to the real useWiredOtherCredentials when no override is passed, without crashing", () => {
    expect(() =>
      render(
        <FetchQueryProvider>
          <AccessTokensTab useAccessTokensHook={() => makeAccessTokens()} />
        </FetchQueryProvider>
      )
    ).not.toThrow();
  });
});

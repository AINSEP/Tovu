import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OtherCredentialEntry } from "../OtherCredentialsSection";
import type { OtherCredentialRowState, OtherCredentialsController } from "../hooks/use-other-credentials.hooks";
import { otherCredentialStoreInfo, type OtherCredentialStoreInfo } from "../rules";

/**
 * @file `OtherCredentialEntry` — Tier 2's one top-level row component (`AccessTokensTab.hooks.tsx`'s
 * `useMergedSecretsOrder` now owns the per-store visibility check and multi-item explosion this file
 * used to drive through the now-deleted `OtherCredentialsSection`/`MaybeOtherCredentialGroup`/
 * `OtherCredentialGroup` wrapper layers — those three behaviors moved to
 * `AccessTokensTab.hooks.unit.test.tsx` instead, since that hook is where the logic now lives; see
 * this repo's `2026-09-21-tovu-94-secrets-order-2.md` handoff). This file drives `OtherCredentialEntry`
 * directly off hand-built `store`/`row` props (same convention `AccessTokensTab.credential-flows.unit
 * .test.tsx`'s own per-component fixtures use) rather than through `useOtherCredentials` — that
 * hook's own read/write behavior is `use-other-credentials.unit.test.tsx`'s job, this file only
 * proves the render/dispatch logic per row state.
 *
 * jsdom (29.1.1, this repo's pinned version) does not implement `HTMLDialogElement.prototype
 * .showModal`/`.close` at all — real browsers all do, so this is a test-environment gap, not a
 * product bug — same reasoning `use-media-lightbox.unit.test.ts`'s own `fakeDialog` helper
 * documents. `OtherCredentialRemoveDialog` calls both unconditionally (unlike `ImagePreviewModal
 * .hooks.tsx`'s guarded `typeof dialog.showModal === "function"` check), so the prototype is
 * polyfilled once here to keep `open`/`close()` behaving the way a real `<dialog>` would.
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

function makeController(overrides: Partial<OtherCredentialsController> = {}): OtherCredentialsController {
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

function rowFixture(store: OtherCredentialStoreInfo, overrides: Partial<OtherCredentialRowState> = {}): OtherCredentialRowState {
  return {
    key: `${store.id}:${store.id}`,
    store,
    itemId: store.id,
    name: store.label,
    valueFact: "••••abcd",
    updatedAt: null,
    token: "",
    saving: false,
    error: null,
    ...overrides,
  };
}

describe("OtherCredentialEntry — placeholder vs configured", () => {
  it("renders the 'Not configured' placeholder and its deep link when row is undefined", () => {
    const store = otherCredentialStoreInfo("site-assistant");
    render(<OtherCredentialEntry store={store} row={undefined} controller={makeController()} />);
    expect(screen.getByText("Not configured")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Manage on AI Assistant/ })).toBeInTheDocument();
  });

  it("renders a configured item under its own item name, not the store's generic label", () => {
    const store = otherCredentialStoreInfo("media-provider");
    const row = rowFixture(store, { itemId: "cloudinary", name: "Cloudinary" });
    render(<OtherCredentialEntry store={store} row={row} controller={makeController()} />);
    expect(screen.getByText("Cloudinary")).toBeInTheDocument();
    expect(screen.queryByText("Not configured")).not.toBeInTheDocument();
  });

  // Regression: `OtherCredentialStaticRow`/`OtherCredentialReplaceableRow` render unconditionally
  // (no accordion, no menu — unlike Tier 1's `TokenRow`), so a multi-item store's Remove buttons are
  // ALWAYS simultaneously in the DOM once `useMergedSecretsOrder` mounts one `OtherCredentialEntry`
  // per configured item. Before `row.name` was appended, both read identically ("Remove from Tovu").
  it("gives two entries for the same store DISTINCT Remove-button accessible names, by row name", () => {
    const store = otherCredentialStoreInfo("media-provider");
    const rows = [rowFixture(store, { itemId: "cloudinary", name: "Cloudinary" }), rowFixture(store, { itemId: "grok", name: "xAI Grok" })];
    render(
      <>
        <OtherCredentialEntry store={store} row={rows[0]} controller={makeController()} />
        <OtherCredentialEntry store={store} row={rows[1]} controller={makeController()} />
      </>
    );

    expect(screen.getByRole("button", { name: "Remove from Tovu — Cloudinary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove from Tovu — xAI Grok" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Remove from Tovu —/ })).toHaveLength(2);
  });
});

describe("OtherCredentialEntryBody dispatch", () => {
  it("a store that supports Replace renders the disabled masked-value field (OtherCredentialReplaceableRow)", () => {
    const store = otherCredentialStoreInfo("site-assistant"); // supportsReplace: true
    const row = rowFixture(store, { valueFact: "••••live" });
    render(<OtherCredentialEntry store={store} row={row} controller={makeController()} />);
    expect(screen.getByLabelText("Access token")).toHaveValue("••••live");
    expect(screen.getByLabelText("Access token")).toBeDisabled();
  });

  it("a store that does NOT support Replace renders just the value fact and a direct Remove (OtherCredentialStaticRow)", () => {
    const store = otherCredentialStoreInfo("composio-connector"); // supportsReplace: false
    const row = rowFixture(store, { valueFact: "Connected as: me@example.com" });
    render(<OtherCredentialEntry store={store} row={row} controller={makeController()} />);
    expect(screen.getByText("Connected as: me@example.com")).toBeInTheDocument();
    expect(screen.queryByLabelText("Access token")).not.toBeInTheDocument();
  });
});

describe("OtherCredentialStaticRow", () => {
  // Regression (terra security review 2026-09-20, High #1): this row's Remove used to call
  // `controller.remove(row)` on the first click — the one Tier-2 row with NO confirm, even though its
  // two stores are the most destructive ones on the page (an External MCP delete loses a sealed OAuth
  // secret for good; a Composio disconnect revokes the account at Composio). Both stores are covered,
  // since each is its own route to its own irreversible sink.
  const STATIC_CASES = [
    {
      storeId: "external-mcp",
      itemId: "local-fs",
      name: "Local filesystem",
      body: "This deletes the server and its saved credentials. It can't be undone — you'd have to set it up again, and sign in again if it uses OAuth.",
    },
    {
      storeId: "composio-connector",
      itemId: "github",
      name: "GitHub",
      body: "This disconnects the account and revokes its access at Composio. To use it again, you'd have to connect it and sign in again.",
    },
  ] as const;

  for (const { storeId, itemId, name, body } of STATIC_CASES) {
    it(`${storeId}: Remove opens a confirm dialog and does NOT call controller.remove on the first click`, () => {
      const remove = vi.fn().mockResolvedValue(undefined);
      const store = otherCredentialStoreInfo(storeId);
      const row = rowFixture(store, { itemId, name });
      const { container } = render(<OtherCredentialEntry store={store} row={row} controller={makeController({ remove })} />);

      // Accessible name is "Remove from Tovu — <row name>", not a bare "Remove from Tovu" — see
      // `OtherCredentialStaticRow`'s own `aria-label` comment: a store can hold more than one item.
      fireEvent.click(screen.getByRole("button", { name: `Remove from Tovu — ${name}` }));

      expect(remove).not.toHaveBeenCalled();
      const dialog = container.querySelector<HTMLDialogElement>("dialog.confirm-dialog");
      expect(dialog).not.toBeNull();
      expect(dialog!.hasAttribute("open")).toBe(true);
      expect(within(dialog!).getByRole("heading", { level: 2, hidden: true })).toHaveTextContent(`Remove "${name}" from Tovu?`);
      expect(dialog!.querySelector(".confirm-dialog-body")).toHaveTextContent(body);
    });

    it(`${storeId}: Cancel closes the dialog without calling controller.remove`, () => {
      const remove = vi.fn().mockResolvedValue(undefined);
      const store = otherCredentialStoreInfo(storeId);
      const row = rowFixture(store, { itemId, name });
      const { container } = render(<OtherCredentialEntry store={store} row={row} controller={makeController({ remove })} />);

      fireEvent.click(screen.getByRole("button", { name: `Remove from Tovu — ${name}` }));
      const dialog = container.querySelector<HTMLDialogElement>("dialog.confirm-dialog")!;
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel", hidden: true }));

      expect(dialog.hasAttribute("open")).toBe(false);
      expect(remove).not.toHaveBeenCalled();
    });

    it(`${storeId}: confirming calls controller.remove exactly once, with this row`, () => {
      const remove = vi.fn().mockResolvedValue(undefined);
      const store = otherCredentialStoreInfo(storeId);
      const row = rowFixture(store, { itemId, name });
      const { container } = render(<OtherCredentialEntry store={store} row={row} controller={makeController({ remove })} />);

      fireEvent.click(screen.getByRole("button", { name: `Remove from Tovu — ${name}` }));
      const dialog = container.querySelector<HTMLDialogElement>("dialog.confirm-dialog")!;
      fireEvent.click(within(dialog).getByRole("button", { name: "Remove from Tovu", hidden: true }));

      expect(remove).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledWith(row);
      expect(dialog.hasAttribute("open")).toBe(false);
    });
  }

  it("shows the saved timestamp only when updatedAt is set", () => {
    const store = otherCredentialStoreInfo("external-mcp");
    const withDate = rowFixture(store, { itemId: "a", updatedAt: "2026-08-01T00:00:00.000Z" });
    const { container, rerender } = render(<OtherCredentialEntry store={store} row={withDate} controller={makeController()} />);
    // Scoped to the summary's own meta span — this row now also renders its (closed) Remove dialog,
    // whose body copy mentions "saved credentials", so an unscoped `/saved/` text query is ambiguous.
    expect(container.querySelector(".access-tokens-row-summary-meta")).toHaveTextContent(/^saved \S/);

    const withoutDate = rowFixture(store, { itemId: "a", updatedAt: null });
    rerender(<OtherCredentialEntry store={store} row={withoutDate} controller={makeController()} />);
    expect(container.querySelector(".access-tokens-row-summary-meta")).not.toBeInTheDocument();
  });

  it("shows a visible alert with the row's own error text when present", () => {
    const store = otherCredentialStoreInfo("external-mcp");
    const row = rowFixture(store, { error: "Couldn't save this token: network down" });
    render(<OtherCredentialEntry store={store} row={row} controller={makeController()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save this token: network down");
  });
});

describe("OtherCredentialReplaceableRow + remove confirm dialog", () => {
  it("shows the saved timestamp in the field label only when updatedAt is set", () => {
    const store = otherCredentialStoreInfo("site-assistant");
    const withDate = rowFixture(store, { updatedAt: "2026-08-01T00:00:00.000Z" });
    const { container, rerender } = render(<OtherCredentialEntry store={store} row={withDate} controller={makeController()} />);
    expect(container.querySelector(".access-tokens-field-label-meta")).toHaveTextContent(/saved/);

    const withoutDate = rowFixture(store, { updatedAt: null });
    rerender(<OtherCredentialEntry store={store} row={withoutDate} controller={makeController()} />);
    expect(container.querySelector(".access-tokens-field-label-meta")).not.toBeInTheDocument();
  });

  it("shows a visible alert with the row's own error text when present", () => {
    const store = otherCredentialStoreInfo("site-assistant");
    const row = rowFixture(store, { error: "Couldn't save this token: network down" });
    render(<OtherCredentialEntry store={store} row={row} controller={makeController()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save this token: network down");
  });

  // Pins the four replaceable stores' body copy as it was before the static-row fix gave the other
  // two stores their own wording — `otherCredentialRemoveDialogBody` must keep routing these through
  // the shared "does NOT revoke" template unchanged.
  it("the confirm dialog body for a replaceable store is the shared 'does NOT revoke' copy, unchanged", () => {
    const store = otherCredentialStoreInfo("media-provider");
    const row = rowFixture(store, { itemId: "cloudinary", name: "Cloudinary" });
    const { container } = render(<OtherCredentialEntry store={store} row={row} controller={makeController()} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove from Tovu — Cloudinary" }));
    const dialog = container.querySelector<HTMLDialogElement>("dialog.confirm-dialog")!;
    expect(dialog.querySelector(".confirm-dialog-body")).toHaveTextContent(
      "This deletes Tovu's saved copy of this Media token. It does NOT revoke the token on Media — it stays valid there until you revoke it yourself."
    );
  });

  it("clicking Remove opens the confirm dialog, and Cancel closes it without calling controller.remove", () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const store = otherCredentialStoreInfo("site-assistant");
    const row = rowFixture(store, { name: "Site assistant model key" });
    const { container } = render(<OtherCredentialEntry store={store} row={row} controller={makeController({ remove })} />);

    // Only the row's own trigger button is accessible before the dialog opens — the closed
    // `<dialog>`'s identically-labeled confirm button is accessibility-hidden (no `open` attribute),
    // same as `access-tokens-revoke-copy.unit.test.tsx`'s own dialog tests document. The trigger's
    // accessible name includes the row's own name ("Remove from Tovu — Site assistant model key")
    // — see `OtherCredentialReplaceableRow`'s own `aria-label` comment.
    fireEvent.click(screen.getByRole("button", { name: "Remove from Tovu — Site assistant model key" }));
    const dialog = container.querySelector<HTMLDialogElement>("dialog.confirm-dialog")!;
    expect(dialog.textContent).toContain('Remove "Site assistant model key" from Tovu?');

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel", hidden: true }));
    expect(remove).not.toHaveBeenCalled();
  });

  it("confirming the dialog calls controller.remove(row) with this row", () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const store = otherCredentialStoreInfo("site-assistant");
    const row = rowFixture(store, { name: "Site assistant model key" });
    const { container } = render(<OtherCredentialEntry store={store} row={row} controller={makeController({ remove })} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove from Tovu — Site assistant model key" }));
    const dialog = container.querySelector<HTMLDialogElement>("dialog.confirm-dialog")!;
    // Scope to the dialog itself, with `hidden: true` since the dialog has no `open` attribute in
    // jsdom (its own `showModal()` is not implemented there).
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove from Tovu", hidden: true }));

    expect(remove).toHaveBeenCalledWith(row);
  });

  // Regression, mirroring the identical fix on Tier 1's own `RemoveConfirmDialog`
  // (`AccessTokensTab.credential-flows.unit.test.tsx`): this dialog's own header already claims it
  // "mirrors Tier 1's RemoveConfirmDialog exactly" — it did not, for the accessible name. A native
  // `<dialog>` gets no accessible name for free from an `<h2>` inside it; that link has to be
  // stated via `aria-labelledby`.
  it("the confirm dialog's accessible name comes from aria-labelledby pointing at its own <h2>", () => {
    const store = otherCredentialStoreInfo("site-assistant");
    const row = rowFixture(store, { name: "Site assistant model key" });
    const { container } = render(<OtherCredentialEntry store={store} row={row} controller={makeController()} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove from Tovu — Site assistant model key" }));
    const dialog = container.querySelector<HTMLDialogElement>("dialog.confirm-dialog")!;
    const titleId = dialog.getAttribute("aria-labelledby");
    expect(titleId).toBeTruthy();
    const title = container.querySelector(`#${titleId}`);
    expect(title).not.toBeNull();
    expect(title!.tagName).toBe("H2");
  });
});

describe("OtherCredentialEntry — agentHandle id safety (unsafe item ids never crash the row)", () => {
  it("renders a media-provider/composio-connector row whose raw item id is not handle-safe (contains an underscore), without throwing", () => {
    const store = otherCredentialStoreInfo("composio-connector");
    const row = rowFixture(store, { itemId: "google_calendar", name: "Google Calendar" });
    expect(() => render(<OtherCredentialEntry store={store} row={row} controller={makeController()} />)).not.toThrow();
    expect(screen.getByText("Google Calendar")).toBeInTheDocument();
  });
});

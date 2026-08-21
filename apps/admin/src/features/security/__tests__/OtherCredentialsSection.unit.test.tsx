import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OtherCredentialsSection } from "../OtherCredentialsSection";
import type { OtherCredentialGroupState, OtherCredentialRowState, OtherCredentialsController } from "../hooks/use-other-credentials.hooks";
import { OTHER_CREDENTIAL_STORES, otherCredentialStoreInfo, type OtherCredentialStoreInfo } from "../rules";

/**
 * @file `OtherCredentialsSection` — Tier 2 of the Access Tokens list. Driven directly off a
 * hand-built `OtherCredentialsController`/`OtherCredentialGroupState` fixture (same convention
 * `AccessTokensTab.unit.test.tsx`'s `makeOtherCredentials` establishes) rather than through
 * `useOtherCredentials` — that hook's own read/write behavior is `use-other-credentials.unit.test.tsx`'s
 * job, this file only proves the render/dispatch logic per row state.
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

function groupFixture(storeId: OtherCredentialStoreInfo["id"], rows: OtherCredentialRowState[] = []): OtherCredentialGroupState {
  return { store: otherCredentialStoreInfo(storeId), rows };
}

describe("OtherCredentialsSection — top level", () => {
  it("renders nothing while groups is undefined (still loading)", () => {
    const { container } = render(<OtherCredentialsSection controller={makeController({ groups: undefined })} query="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one entry per store once groups resolves", () => {
    render(<OtherCredentialsSection controller={makeController({ groups: OTHER_CREDENTIAL_STORES.map((s) => groupFixture(s.id)) })} query="" />);
    // Every store renders at least its placeholder heading — six stores, six headings.
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(OTHER_CREDENTIAL_STORES.length);
  });
});

describe("OtherCredentialsSection — MaybeOtherCredentialGroup: query visibility", () => {
  it("hides a store with zero rows whose own label/purpose does not match the query", () => {
    render(<OtherCredentialsSection controller={makeController({ groups: [groupFixture("site-assistant")] })} query="zzz-no-match" />);
    expect(screen.queryByText("Site assistant model key")).not.toBeInTheDocument();
  });

  it("still shows a store with zero rows when the query matches its own label", () => {
    render(<OtherCredentialsSection controller={makeController({ groups: [groupFixture("site-assistant")] })} query="site assistant" />);
    expect(screen.getByText("Site assistant model key")).toBeInTheDocument();
  });

  it("shows a store whose rows already matched the query upstream, even if the store's own label does not", () => {
    const store = otherCredentialStoreInfo("media-provider");
    const row = rowFixture(store, { itemId: "cloudinary", name: "Cloudinary" });
    render(<OtherCredentialsSection controller={makeController({ groups: [groupFixture("media-provider", [row])] })} query="cloudinary" />);
    expect(screen.getByText("Cloudinary")).toBeInTheDocument();
  });
});

describe("OtherCredentialsSection — OtherCredentialGroup: placeholder vs configured rows", () => {
  it("renders exactly one 'Not configured' placeholder entry for a store with zero items", () => {
    render(<OtherCredentialsSection controller={makeController({ groups: [groupFixture("site-assistant")] })} query="" />);
    expect(screen.getByText("Not configured")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Manage on AI Assistant/ })).toBeInTheDocument();
  });

  it("renders one entry per configured item for a multi-item store, never a placeholder alongside them", () => {
    const store = otherCredentialStoreInfo("media-provider");
    const rows = [rowFixture(store, { itemId: "cloudinary", name: "Cloudinary" }), rowFixture(store, { itemId: "grok", name: "xAI Grok" })];
    render(<OtherCredentialsSection controller={makeController({ groups: [groupFixture("media-provider", rows)] })} query="" />);
    expect(screen.getByText("Cloudinary")).toBeInTheDocument();
    expect(screen.getByText("xAI Grok")).toBeInTheDocument();
    expect(screen.queryByText("Not configured")).not.toBeInTheDocument();
  });
});

describe("OtherCredentialsSection — OtherCredentialEntryBody dispatch", () => {
  it("a store that supports Replace renders the disabled masked-value field (OtherCredentialReplaceableRow)", () => {
    const store = otherCredentialStoreInfo("site-assistant"); // supportsReplace: true
    const row = rowFixture(store, { valueFact: "••••live" });
    render(<OtherCredentialsSection controller={makeController({ groups: [groupFixture("site-assistant", [row])] })} query="" />);
    expect(screen.getByLabelText("Access token")).toHaveValue("••••live");
    expect(screen.getByLabelText("Access token")).toBeDisabled();
  });

  it("a store that does NOT support Replace renders just the value fact and a direct Remove (OtherCredentialStaticRow)", () => {
    const store = otherCredentialStoreInfo("composio-connector"); // supportsReplace: false
    const row = rowFixture(store, { valueFact: "Connected as: me@example.com" });
    render(<OtherCredentialsSection controller={makeController({ groups: [groupFixture("composio-connector", [row])] })} query="" />);
    expect(screen.getByText("Connected as: me@example.com")).toBeInTheDocument();
    expect(screen.queryByLabelText("Access token")).not.toBeInTheDocument();
  });
});

describe("OtherCredentialsSection — OtherCredentialStaticRow", () => {
  it("Remove calls controller.remove(row) directly, with no confirm dialog", () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const store = otherCredentialStoreInfo("external-mcp");
    const row = rowFixture(store, { itemId: "local-fs", name: "Local filesystem" });
    render(<OtherCredentialsSection controller={makeController({ groups: [groupFixture("external-mcp", [row])], remove })} query="" />);

    fireEvent.click(screen.getByRole("button", { name: "Remove from Tovu" }));
    expect(remove).toHaveBeenCalledWith(row);
  });

  it("shows the saved timestamp only when updatedAt is set", () => {
    const store = otherCredentialStoreInfo("external-mcp");
    const withDate = rowFixture(store, { itemId: "a", updatedAt: "2026-08-01T00:00:00.000Z" });
    const { rerender } = render(<OtherCredentialsSection controller={makeController({ groups: [groupFixture("external-mcp", [withDate])] })} query="" />);
    expect(screen.getByText(/saved/)).toBeInTheDocument();

    const withoutDate = rowFixture(store, { itemId: "a", updatedAt: null });
    rerender(<OtherCredentialsSection controller={makeController({ groups: [groupFixture("external-mcp", [withoutDate])] })} query="" />);
    expect(screen.queryByText(/saved/)).not.toBeInTheDocument();
  });

  it("shows a visible alert with the row's own error text when present", () => {
    const store = otherCredentialStoreInfo("external-mcp");
    const row = rowFixture(store, { error: "Couldn't save this token: network down" });
    render(<OtherCredentialsSection controller={makeController({ groups: [groupFixture("external-mcp", [row])] })} query="" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save this token: network down");
  });
});

describe("OtherCredentialsSection — OtherCredentialReplaceableRow + remove confirm dialog", () => {
  it("shows the saved timestamp in the field label only when updatedAt is set", () => {
    const store = otherCredentialStoreInfo("site-assistant");
    const withDate = rowFixture(store, { updatedAt: "2026-08-01T00:00:00.000Z" });
    const { container, rerender } = render(<OtherCredentialsSection controller={makeController({ groups: [groupFixture("site-assistant", [withDate])] })} query="" />);
    expect(container.querySelector(".access-tokens-field-label-meta")).toHaveTextContent(/saved/);

    const withoutDate = rowFixture(store, { updatedAt: null });
    rerender(<OtherCredentialsSection controller={makeController({ groups: [groupFixture("site-assistant", [withoutDate])] })} query="" />);
    expect(container.querySelector(".access-tokens-field-label-meta")).not.toBeInTheDocument();
  });

  it("shows a visible alert with the row's own error text when present", () => {
    const store = otherCredentialStoreInfo("site-assistant");
    const row = rowFixture(store, { error: "Couldn't save this token: network down" });
    render(<OtherCredentialsSection controller={makeController({ groups: [groupFixture("site-assistant", [row])] })} query="" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save this token: network down");
  });

  it("clicking Remove opens the confirm dialog, and Cancel closes it without calling controller.remove", () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const store = otherCredentialStoreInfo("site-assistant");
    const row = rowFixture(store, { name: "Site assistant model key" });
    const { container } = render(<OtherCredentialsSection controller={makeController({ groups: [groupFixture("site-assistant", [row])], remove })} query="" />);

    // Only the row's own trigger button is accessible before the dialog opens — the closed
    // `<dialog>`'s identically-labeled confirm button is accessibility-hidden (no `open` attribute),
    // same as `access-tokens-revoke-copy.unit.test.tsx`'s own dialog tests document.
    fireEvent.click(screen.getByRole("button", { name: "Remove from Tovu" }));
    const dialog = container.querySelector("dialog.confirm-dialog")!;
    expect(dialog.textContent).toContain('Remove "Site assistant model key" from Tovu?');

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel", hidden: true }));
    expect(remove).not.toHaveBeenCalled();
  });

  it("confirming the dialog calls controller.remove(row) with this row", () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const store = otherCredentialStoreInfo("site-assistant");
    const row = rowFixture(store, { name: "Site assistant model key" });
    const { container } = render(<OtherCredentialsSection controller={makeController({ groups: [groupFixture("site-assistant", [row])], remove })} query="" />);

    fireEvent.click(screen.getByRole("button", { name: "Remove from Tovu" }));
    const dialog = container.querySelector("dialog.confirm-dialog")!;
    // Two buttons read "Remove from Tovu" in this dialog's DOM (the row's own trigger button, and the
    // dialog's own confirm button) — scope to the dialog itself, with `hidden: true` since the dialog
    // has no `open` attribute in jsdom (its own `showModal()` is not implemented there).
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove from Tovu", hidden: true }));

    expect(remove).toHaveBeenCalledWith(row);
  });
});

describe("OtherCredentialsSection — agentHandle id safety (unsafe item ids never crash the row)", () => {
  it("renders a media-provider/composio-connector row whose raw item id is not handle-safe (contains an underscore), without throwing", () => {
    const store = otherCredentialStoreInfo("composio-connector");
    const row = rowFixture(store, { itemId: "google_calendar", name: "Google Calendar" });
    expect(() => render(<OtherCredentialsSection controller={makeController({ groups: [groupFixture("composio-connector", [row])] })} query="" />)).not.toThrow();
    expect(screen.getByText("Google Calendar")).toBeInTheDocument();
  });
});

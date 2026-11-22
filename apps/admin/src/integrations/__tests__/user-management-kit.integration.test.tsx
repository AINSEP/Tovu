import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { UserManagementKitProvider, ConfirmDialog, InfoTip, RowMenu, SecretInput, useAsyncAction, useFetchMutation, useFetchQuery, type UserManagementKit } from "@jini-ai/user-management/react/kit";
import { fireEvent, render, screen } from "@/__tests__/render-with-jini-kits";
import { userManagementKit } from "../jini-kits";

/** Test-only consumer through the kit's same-name slots, over Tovu's REAL bindings (the host half of the C9c pair). */
function Consumer({ onDelete, onConfirm }: { onDelete: () => void; onConfirm: () => void }) {
  const query = useFetchQuery({ key: ["um-kit-probe"], fetch: () => Promise.resolve("loaded users") });
  const mutation = useFetchMutation({ run: ({ input }: { input: string }) => Promise.resolve(input) });
  const action = useAsyncAction();
  const [password, setPassword] = useState("");
  return (
    <div>
      <p data-testid="query">{query.status}:{query.data ?? ""}</p>
      <p data-testid="mutation">{mutation.status}</p>
      <p data-testid="action">{action.saving ? "saving" : "idle"}</p>
      <SecretInput id="um-probe-password" label="Password" toggleLabels={{ show: "Show password", hide: "Hide password" }} value={password} onChange={(e) => setPassword(e.target.value)} />
      <RowMenu triggerLabel={`Actions for user "ada"`} items={[{ key: "delete", label: "Delete", tone: "danger", onSelect: onDelete }]} />
      <ConfirmDialog open title="Delete this user?" body={<p>This moves ada to the Trash.</p>} confirmLabel="Delete" cancelLabel="Cancel" tone="danger" onConfirm={onConfirm} onCancel={() => {}} />
      <InfoTip label="Owners have full control." triggerLabel="About roles" />
    </div>
  );
}
const renderConsumer = (kit: UserManagementKit = userManagementKit, handlers = { onDelete: vi.fn(), onConfirm: vi.fn() }) => {
  render(<UserManagementKitProvider kit={kit}><Consumer {...handlers} /></UserManagementKitProvider>);
  return handlers;
};

describe("Tovu's user-management kit binding", () => {
  it("renders the real ui SecretInput through the slot and toggles its secret with the translated labels", () => {
    renderConsumer();
    // `label` names the eye toggle only; the visible field label is the caller's own <label htmlFor>.
    const field = document.getElementById("um-probe-password");
    if (!field) throw new Error("the real SecretInput did not render its input with the id the slot passed through");
    expect(field).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(field).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeInTheDocument();
  });

  it("renders admin's real ConfirmDialog (body, tone, confirm label) and wires its confirm action", () => {
    const { onConfirm } = renderConsumer();
    expect(screen.getByText("This moves ada to the Trash.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("renders admin's real RowMenu trigger under its full accessible name and the real InfoTip icon", () => {
    renderConsumer();
    expect(screen.getByRole("button", { name: `Actions for user "ada"` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "About roles" })).toBeInTheDocument();
  });

  it("serves the hooks from ui's real fetch-query adapter: loading, then the fetched value; mutation and async action idle", async () => {
    renderConsumer();
    expect(screen.getByTestId("query")).toHaveTextContent("loading:");
    expect(await screen.findByText("success:loaded users")).toBeInTheDocument();
    expect(screen.getByTestId("mutation")).toHaveTextContent("idle");
    expect(screen.getByTestId("action")).toHaveTextContent("idle");
  });
});

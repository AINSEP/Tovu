import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/lib/fetch-query";
import { Users } from "../Users";

/**
 * @file `Users` — covers the create-user form, the loading/error/empty states, and the expanded
 * "Manage" panel's assign-role/attach-policy/save-email flows. `Users.unit.test.tsx` already pins
 * the `RowMenu` rollout (Manage/Disable/Enable/Reset password); this file targets the rest of the
 * screen, which was still 39.4% covered (rank #10 by risk) after that pass.
 *
 * `Users` has no injectable hook seam used here, so every `render(<Users />)` below needs a
 * `FetchQueryProvider` ancestor (2026-08-12, `lib/fetch-query` migration).
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const ACTIVE_USER = {
  principalId: "u1",
  workspaceId: "w1",
  username: "alice",
  email: "alice@example.com",
  status: "active" as const,
  createdAt: "2026-08-01T00:00:00.000Z",
  roleIds: ["r1"],
  policyIds: [],
};

const ROLE = { id: "r1", name: "Editor", isBuiltin: false };
const POLICY = { id: "p1", name: "Read-only", isBuiltin: false };

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `Users` now also calls `useAdminLocale()` (real `fetch`, not this screen's own concern), which
  // would otherwise consume one of this file's strictly-ordered `mockResolvedValueOnce` slots and
  // shift every later assertion by one call. Routed to a fixed default-locale response outside
  // `fetchMock`'s own call queue, so `fetchMock.mock.calls` still holds exactly this screen's own
  // requests, in the order each test already expects.
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }),
      );
    }
    // `useUsers` now also calls `port.me()` unconditionally on mount (password-banner plan,
    // 2026-09-24 Slice 3 deep-link half) — see `Users.unit.test.tsx`'s identical interceptor for why
    // this is routed outside `fetchMock`'s own strictly-ordered queue, and why `.endsWith`, not
    // `.includes`, so it can't also swallow `/auth/me/password-status`.
    if (String(url).endsWith("/auth/me")) {
      return Promise.resolve(jsonResponse({ user: { id: "not-a-seeded-user" } }));
    }
    return fetchMock(url, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loading, error, and empty states", () => {
  it("shows a loading placeholder before users/roles/policies resolve", () => {
    fetchMock.mockReturnValue(new Promise(() => {})); // never resolves
    render(<FetchQueryProvider><Users /></FetchQueryProvider>);
    expect(screen.getByText("Loading users…")).toBeInTheDocument();
  });

  it("shows the error message instead of the table when the initial load fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    render(<FetchQueryProvider><Users /></FetchQueryProvider>);
    expect(await screen.findByText("network down")).toBeInTheDocument();
  });

  it("shows the empty state when there are no users yet", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }));
    render(<FetchQueryProvider><Users /></FetchQueryProvider>);
    expect(await screen.findByText("No users yet.")).toBeInTheDocument();
  });
});

describe("New user form", () => {
  it("is closed by default; New user opens it, Cancel closes it again", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }));
    render(<FetchQueryProvider><Users /></FetchQueryProvider>);

    await screen.findByText("No users yet.");
    expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New user" }));
    expect(screen.getByLabelText("Username")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();
  });

  it("submits username/email/password and reloads the list on success", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }))
      .mockResolvedValueOnce(jsonResponse({ user: ACTIVE_USER })) // POST create
      .mockResolvedValueOnce(jsonResponse({ users: [ACTIVE_USER] })) // reload
      .mockResolvedValueOnce(jsonResponse({ roles: [ROLE] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [POLICY] }));
    render(<FetchQueryProvider><Users /></FetchQueryProvider>);

    await screen.findByText("No users yet.");
    await user.click(screen.getByRole("button", { name: "New user" }));
    await user.type(screen.getByLabelText("Username"), "alice");
    // Was `/email/i` — now ambiguous: the page header's new reset-password `InfoTip` (2026-09-24)
    // has an accessible name that also contains "email", so the fuzzy regex matches both. The
    // create form's own field label ("Email (optional)", `NewUserForm`) is exact and unambiguous.
    await user.type(screen.getByLabelText("Email (optional)"), "alice@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter22");
    await user.click(screen.getByRole("button", { name: "Create user" }));

    await screen.findByText("alice");
    // The form closes on success — it's no longer in the DOM.
    expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();

    const createCall = fetchMock.mock.calls[3];
    expect(createCall[1]?.method).toBe("POST");
    expect(JSON.parse(createCall[1]?.body as string)).toMatchObject({ username: "alice", password: "hunter22" });
  });

  it("shows Creating… and disables submit while the create request is in flight", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }))
      .mockReturnValueOnce(new Promise(() => {})); // create POST never resolves
    render(<FetchQueryProvider><Users /></FetchQueryProvider>);

    await screen.findByText("No users yet.");
    await user.click(screen.getByRole("button", { name: "New user" }));
    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "hunter22");
    await user.click(screen.getByRole("button", { name: "Create user" }));

    expect(await screen.findByRole("button", { name: "Creating…" })).toBeDisabled();
  });

  it("keeps the form open and shows the error on a failed create", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }))
      .mockResolvedValueOnce(jsonResponse({ error: "RESOURCE_CONFLICT", code: "RESOURCE_CONFLICT" }, 409));
    render(<FetchQueryProvider><Users /></FetchQueryProvider>);

    await screen.findByText("No users yet.");
    await user.click(screen.getByRole("button", { name: "New user" }));
    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "hunter22");
    await user.click(screen.getByRole("button", { name: "Create user" }));

    expect(await screen.findByText("That username is already in use.")).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
  });
});

describe("Manage panel — assign role / attach policy / save email", () => {
  async function openManagePanel(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("button", { name: "alice" }));
    return screen.getByText("Assign role").closest(".integrations-form") as HTMLElement;
  }

  it("assigns a role and reloads", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [ACTIVE_USER] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [ROLE] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }))
      .mockResolvedValueOnce(jsonResponse({})) // POST assign role
      .mockResolvedValueOnce(jsonResponse({ users: [{ ...ACTIVE_USER, roleIds: ["r1"] }] })) // reload
      .mockResolvedValueOnce(jsonResponse({ roles: [ROLE] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }));
    render(<FetchQueryProvider><Users /></FetchQueryProvider>);

    const panel = await openManagePanel(user);
    await user.selectOptions(within(panel).getByRole("combobox", { name: /assign role/i }), "r1");
    await user.click(within(panel).getByRole("button", { name: "Assign" }));

    // Scoped to the summary `<tr>`, not the whole table — the expanded Manage panel is a sibling
    // `<tr>` in the same `<table>` and its own "Assign role" select also has an "Editor" option.
    const row = screen.getByRole("button", { name: "alice" }).closest("tr") as HTMLElement;
    await within(row).findByText("Editor");
    expect(fetchMock.mock.calls[3][1]?.method).toBe("POST");
  });

  it("Assign is disabled until a role is picked", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [ACTIVE_USER] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [ROLE] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }));
    render(<FetchQueryProvider><Users /></FetchQueryProvider>);

    const panel = await openManagePanel(user);
    expect(within(panel).getByRole("button", { name: "Assign" })).toBeDisabled();
  });

  it("attaches a policy and reloads", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [ACTIVE_USER] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [POLICY] }))
      .mockResolvedValueOnce(jsonResponse({})) // POST attach policy
      .mockResolvedValueOnce(jsonResponse({ users: [{ ...ACTIVE_USER, policyIds: ["p1"] }] })) // reload
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [POLICY] }));
    render(<FetchQueryProvider><Users /></FetchQueryProvider>);

    const panel = await openManagePanel(user);
    await user.selectOptions(within(panel).getByRole("combobox", { name: /attach policy/i }), "p1");
    await user.click(within(panel).getByRole("button", { name: "Attach" }));

    const row = screen.getByRole("button", { name: "alice" }).closest("tr") as HTMLElement;
    await within(row).findByText("Read-only");
  });

  it("shows the grant error inline and keeps the panel open on failure", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [ACTIVE_USER] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [ROLE] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }))
      .mockResolvedValueOnce(jsonResponse({ error: "cannot grant", code: "GRANT_EXCEEDS_ISSUER" }, 403));
    render(<FetchQueryProvider><Users /></FetchQueryProvider>);

    const panel = await openManagePanel(user);
    await user.selectOptions(within(panel).getByRole("combobox", { name: /assign role/i }), "r1");
    await user.click(within(panel).getByRole("button", { name: "Assign" }));

    expect(await screen.findByText("You cannot grant a permission you do not hold.")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Assign" })).toBeInTheDocument();
  });

  it("saves an edited email and reloads", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [ACTIVE_USER] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }))
      .mockResolvedValueOnce(jsonResponse({})) // PATCH email
      .mockResolvedValueOnce(jsonResponse({ users: [{ ...ACTIVE_USER, email: "new@example.com" }] })) // reload
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }));
    render(<FetchQueryProvider><Users /></FetchQueryProvider>);

    const panel = await openManagePanel(user);
    const emailInput = within(panel).getByLabelText("Email") as HTMLInputElement;
    await user.clear(emailInput);
    await user.type(emailInput, "new@example.com");
    await user.click(within(panel).getByRole("button", { name: "Save email" }));

    expect(await screen.findByText("new@example.com")).toBeInTheDocument();
  });
});

describe("Disable failure", () => {
  it("shows the toggle error banner above the table, and closes the confirm dialog either way", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [ACTIVE_USER] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }))
      .mockResolvedValueOnce(jsonResponse({ error: "cannot", code: "OWNER_REQUIRED" }, 409));
    render(<FetchQueryProvider><Users /></FetchQueryProvider>);

    await user.click(await screen.findByRole("button", { name: 'Actions for user "alice"' }));
    await user.click(screen.getByRole("menuitem", { name: "Disable" }));
    const dialog = screen.getByText(/disable this user\?/i).closest("dialog") as HTMLElement;
    await user.click(within(dialog).getByRole("button", { name: /^disable$/i }));

    expect(await screen.findByText("The workspace must keep at least one active owner.")).toBeInTheDocument();
    expect(dialog).not.toHaveAttribute("open");
  });
});

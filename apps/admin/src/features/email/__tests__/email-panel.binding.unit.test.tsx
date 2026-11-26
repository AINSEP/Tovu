import { describe, expect, it, vi } from "vitest";

const routerNavigate = vi.hoisted(() => vi.fn());
vi.mock("@jini-ai/admin/shell/lib/router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@jini-ai/admin/shell/lib/router")>()),
  navigate: routerNavigate,
}));

const { navigateEmail } = await import("../email-panel");

/**
 * @file The host binding of the Email screen's `navigate` port: this app owns the URL shape
 * (`/email?tab=…&p=…`), so the section id is encoded here and every tab/section change replaces the
 * history entry rather than stacking one per click.
 */
describe("navigateEmail", () => {
  it("encodes the section id into ?p= and replaces the history entry", () => {
    routerNavigate.mockClear();
    navigateEmail({ tabId: "sender", part: "a b" });
    expect(routerNavigate).toHaveBeenCalledExactlyOnceWith({ routePath: "/email?tab=sender&p=a%20b" }, { replace: true });
  });

  it("drops ?p= when no section is chosen", () => {
    routerNavigate.mockClear();
    navigateEmail({ tabId: "provider", part: null });
    expect(routerNavigate).toHaveBeenCalledExactlyOnceWith({ routePath: "/email?tab=provider" }, { replace: true });
  });
});

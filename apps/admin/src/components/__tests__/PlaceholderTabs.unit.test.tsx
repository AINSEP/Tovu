import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PlaceholderTabs } from "../PlaceholderTabs";

/**
 * @file First test file for `PlaceholderTabs.tsx` (0% before this pass — no existing suite mounts
 * it). Note for the coordinator: as of this pass, `panels.tsx` still imports this component but no
 * longer renders it anywhere — `deployment` was migrated to real tabs (`Deployment.tsx`'s own file
 * header) and `payments`/`authentication` (the two sections this file's own header names as
 * current consumers) both now render dedicated components (`<Payments />`, `<Authentication />`)
 * instead. This looks like an orphaned import plus a stale doc comment rather than a currently
 * reachable screen; flagged for the coordinator to decide whether to re-wire a future `soon`
 * section to it or prune it, since it wasn't this pass's call to make. Tested anyway rather than
 * treated as dead code: it is fully implemented, exported, production-shaped scaffolding (its own
 * header: "scaffolding a future tab... that should be visibly present"), not a defensive branch or
 * out-of-scope leftover — see `project_unwired_files_are_unbuilt_features` precedent in this
 * repo's own memory for the same distinction.
 *
 * `sectionId="payments"` is a real `getNav()` id (group "Commerce" as of this pass) so
 * `findNavGroupLabel` resolves a real kicker rather than its own "Overview" fallback — that
 * fallback belongs to `findNavGroupLabel`'s own tests (`Placeholder.unit.test.tsx`), not this
 * component's, since `PlaceholderTabs` itself has no branch of its own around that call.
 */

describe("PlaceholderTabs", () => {
  it("renders the section's real nav-group label as the kicker, and the first tab active by default", () => {
    render(
      <PlaceholderTabs
        sectionId="payments"
        tabs={[
          { id: "stripe", label: "Stripe" },
          { id: "paypal", label: "PayPal" },
        ]}
      />,
    );

    expect(document.querySelector(".jini-tabbed-dialog-kicker")).toHaveTextContent("Commerce");
    expect(screen.getByRole("heading", { level: 2, name: "Stripe" })).toBeInTheDocument();
    expect(screen.getByText("Stripe is coming soon.")).toBeInTheDocument();
  });

  it("renders one nav entry per tab, each carrying its own label", () => {
    render(
      <PlaceholderTabs
        sectionId="payments"
        tabs={[
          { id: "stripe", label: "Stripe" },
          { id: "paypal", label: "PayPal" },
        ]}
      />,
    );

    expect(screen.getByTestId("settings-dialog-nav-stripe")).toHaveTextContent("Stripe");
    expect(screen.getByTestId("settings-dialog-nav-paypal")).toHaveTextContent("PayPal");
  });

  it("switching tabs updates the title and the per-tab 'coming soon' subtitle, and renders no panel body", async () => {
    const user = userEvent.setup();
    render(
      <PlaceholderTabs
        sectionId="payments"
        tabs={[
          { id: "stripe", label: "Stripe" },
          { id: "paypal", label: "PayPal" },
        ]}
      />,
    );

    await user.click(screen.getByTestId("settings-dialog-nav-paypal"));

    expect(screen.getByRole("heading", { level: 2, name: "PayPal" })).toBeInTheDocument();
    expect(screen.getByText("PayPal is coming soon.")).toBeInTheDocument();
    expect(screen.queryByText("Stripe is coming soon.")).not.toBeInTheDocument();
    // `panel: null` for every tab — nothing renders in the content area below the header.
    expect(document.querySelector(".jini-tabbed-dialog-content")).toBeEmptyDOMElement();
  });

  it("renders a single tab section without crashing (the minimal, one-tab case)", () => {
    render(<PlaceholderTabs sectionId="payments" tabs={[{ id: "stripe", label: "Stripe" }]} />);

    expect(screen.getByRole("heading", { level: 2, name: "Stripe" })).toBeInTheDocument();
  });
});

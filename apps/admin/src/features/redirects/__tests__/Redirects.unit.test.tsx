import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/lib/fetch-query";
import { Redirects } from "../Redirects";
import { useRedirects } from "../hooks/use-redirects.hooks";
import { createFakeRedirectsPort } from "../hooks/redirects-dependencies.hooks";

/**
 * @file `Redirects` — the first component test for this screen. Drives the REAL `useRedirects`
 * hook through the `useRedirectsHook` seam against `createFakeRedirectsPort`, so this exercises
 * the real create-then-reset wiring end to end rather than a hand-typed `RedirectsController`
 * stub that could already assume the fix. `FetchQueryProvider` is required because `useRedirects`
 * calls the real `useFetchQuery`/`useFetchMutation`.
 *
 * Pins the fix for the "failed create wipes the operator's input" bug: `Redirects.tsx`'s inline
 * `onSubmit` used to call `e.currentTarget.reset()` unconditionally, synchronously, before
 * `createRedirect`'s fire-and-forget mutation had any chance to settle — so a REJECTED create
 * still cleared the form, discarding what the operator typed right when they needed it most (to
 * fix and resubmit). The fix moves the reset into `use-redirects.hooks.ts`'s `submitCreate`,
 * which only resets after `createRedirect` resolves `true`.
 */

describe("Publish section button (plan-publish-sections-2026-09-25.md §2 S3)", () => {
  it("renders the section's own Publish redirects button", async () => {
    const port = createFakeRedirectsPort();
    render(
      <FetchQueryProvider>
        <Redirects useRedirectsHook={() => useRedirects(port, (k) => k, "en")} />
      </FetchQueryProvider>,
    );

    expect(await screen.findByRole("button", { name: "Publish redirects" })).toBeInTheDocument();
  });
});

describe("Redirects — create form", () => {
  it("keeps the operator's input after a failed create, and shows the banner", async () => {
    const user = userEvent.setup();
    const port = {
      ...createFakeRedirectsPort(),
      createRedirect: vi.fn().mockRejectedValue(new Error("fromPattern '/old-path-x' conflicts with an existing rule")),
    };
    render(
      <FetchQueryProvider>
        <Redirects useRedirectsHook={() => useRedirects(port, (k) => k, "en")} />
      </FetchQueryProvider>,
    );

    await screen.findByLabelText("From path");
    await user.type(screen.getByLabelText("From path"), "/old-path-x");
    await user.type(screen.getByLabelText("To target"), "/new-path-x");
    await user.click(screen.getByRole("button", { name: "Add redirect" }));

    await screen.findByText("fromPattern '/old-path-x' conflicts with an existing rule");
    expect(screen.getByLabelText("From path")).toHaveValue("/old-path-x");
    expect(screen.getByLabelText("To target")).toHaveValue("/new-path-x");
  });

  it("clears the form after a successful create", async () => {
    const user = userEvent.setup();
    const port = createFakeRedirectsPort();
    render(
      <FetchQueryProvider>
        <Redirects useRedirectsHook={() => useRedirects(port, (k) => k, "en")} />
      </FetchQueryProvider>,
    );

    await screen.findByLabelText("From path");
    await user.type(screen.getByLabelText("From path"), "/old-path-y");
    await user.type(screen.getByLabelText("To target"), "/new-path-y");
    await user.click(screen.getByRole("button", { name: "Add redirect" }));

    await waitFor(() => expect(screen.getByLabelText("From path")).toHaveValue(""));
    expect(screen.getByLabelText("To target")).toHaveValue("");
    expect(port.rules).toHaveLength(1);
  });
});

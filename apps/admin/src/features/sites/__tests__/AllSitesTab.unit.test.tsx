import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { AllSitesTab, type AllSitesTabProps } from "../AllSitesTab";

function props(overrides: Partial<AllSitesTabProps> = {}): AllSitesTabProps {
  return {
    sites: [],
    snapshot: { sites: [], currentSite: { name: "live", dir: "/sites/live", dirOverridden: false, listed: true }, switchingEnabled: true, persistedSiteName: null },
    switchingEnabled: true, activatingName: null, createdName: null,
    onActivate: vi.fn(), t: (key) => `translated:${key}`, ...overrides,
  };
}

// Author Checklist / F1.3/F4.1/F6.2: literal names and note, scoped notice,
// real render; sibling Sites tests cover card activation and empty states.
it("renders created token names and server note verbatim in the created-site notice", () => {
  // Mutation: omit CreatedTokensLine or run token names/note through t.
  render(<AllSitesTab {...props({ createdName: "atlas", createdTokens: { names: ["Supabase", "Atlas Cloud"], note: "will connect after boot" } })} />);
  const notice = screen.getByText("atlas").closest("p")!;
  expect(notice.textContent).toBe("atlas translated:was created. Activate it to serve after the next restart. Supabase, Atlas Cloud will connect after boot");
  expect(within(notice).getByText("Supabase, Atlas Cloud").tagName).toBe("STRONG");
});

it("hides the entire notice without a created site and omits token text when tokens are absent", () => {
  // Mutation: render tokens outside the createdName guard; stale token confirmation leaks.
  const { rerender } = render(<AllSitesTab {...props({ createdTokens: { names: ["Supabase"], note: "will connect after boot" } })} />);
  expect(screen.getByRole("link", { name: "translated:New site" })).toHaveAttribute("href", "/admin/sites?tab=new");
  expect(screen.queryByText("Supabase")).not.toBeInTheDocument();
  rerender(<AllSitesTab {...props({ createdName: "atlas" })} />);
  expect(screen.getByText("atlas").closest("p")!.textContent).toBe("atlas translated:was created. Activate it to serve after the next restart.");
  expect(screen.queryByText("Supabase")).not.toBeInTheDocument();
});

it("marks only the activating card as saving, blocks both controls, then restores activation", async () => {
  // F1.3/F2.5/F6.2: mutation: use activatingName !== null for every card's
  // label, or stop forwarding activatingName to the disabled-state rule.
  // Author Checklist: distinct card identities, real click/DOM state, exact
  // callback arguments, and a busy-to-idle transition; no subject mocks.
  const user = userEvent.setup();
  const onActivate = vi.fn();
  const sites = [
    { name: "atlas", dir: "/sites/atlas", displayName: "Atlas", active: false, createdAt: "2026-09-30T00:00:00.000Z" },
    { name: "boreal", dir: "/sites/boreal", displayName: "Boreal", active: false, createdAt: "2026-09-30T00:00:00.000Z" },
  ];
  const initial = props({ sites, onActivate });
  const { rerender } = render(<AllSitesTab {...initial} />);
  const atlas = screen.getByRole("button", { name: "translated:Save atlas as the site to serve after the next restart" });
  const boreal = screen.getByRole("button", { name: "translated:Save boreal as the site to serve after the next restart" });
  expect(atlas).toBeEnabled();
  expect(boreal).toBeEnabled();
  rerender(<AllSitesTab {...initial} activatingName="atlas" />);
  expect(atlas.textContent).toBe("translated:Saving…");
  expect(boreal.textContent).toBe("translated:Serve after restart");
  expect(atlas).toBeDisabled();
  expect(boreal).toBeDisabled();
  await user.click(atlas);
  await user.click(boreal);
  expect(onActivate).not.toHaveBeenCalled();
  rerender(<AllSitesTab {...initial} activatingName={null} />);
  expect(atlas.textContent).toBe("translated:Serve after restart");
  expect(atlas).toBeEnabled();
  expect(boreal).toBeEnabled();
  await user.click(boreal);
  expect(onActivate.mock.calls).toEqual([["boreal"]]);
});

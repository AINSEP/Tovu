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
  expect(notice.textContent).toBe("atlas translated:was created. Start it to open its admin. Supabase, Atlas Cloud will connect after boot");
  expect(within(notice).getByText("Supabase, Atlas Cloud").tagName).toBe("STRONG");
});

it("hides the entire notice without a created site and omits token text when tokens are absent", () => {
  // Mutation: render tokens outside the createdName guard; stale token confirmation leaks.
  const { rerender } = render(<AllSitesTab {...props({ createdTokens: { names: ["Supabase"], note: "will connect after boot" } })} />);
  expect(screen.getByRole("link", { name: "translated:New site" })).toHaveAttribute("href", "/admin/sites?tab=new");
  expect(screen.queryByText("Supabase")).not.toBeInTheDocument();
  rerender(<AllSitesTab {...props({ createdName: "atlas" })} />);
  expect(screen.getByText("atlas").closest("p")!.textContent).toBe("atlas translated:was created. Start it to open its admin.");
  expect(screen.queryByText("Supabase")).not.toBeInTheDocument();
});

it("shows Saving… on the activating card, hides Make default everywhere meanwhile, then restores it", async () => {
  // F1.3/F2.5/F6.2: mutation: use activatingName !== null for every card's meta line, or stop
  // forwarding activatingName to the menu rule (a second activation could then be queued).
  // Author Checklist: distinct card identities, real click/DOM state, exact callback arguments,
  // and a busy-to-idle transition; no subject mocks.
  const user = userEvent.setup();
  const onActivate = vi.fn();
  const sites = [
    { name: "atlas", dir: "/sites/atlas", displayName: "atlas", active: false, createdAt: "2026-09-30T00:00:00.000Z" },
    { name: "boreal", dir: "/sites/boreal", displayName: "boreal", active: false, createdAt: "2026-09-30T00:00:00.000Z" },
  ];
  const initial = props({ sites, onActivate, t: (key) => key });
  const { rerender } = render(<AllSitesTab {...initial} />);
  expect(screen.getByRole("button", { name: "More actions for atlas" })).toHaveAttribute("aria-haspopup", "menu");
  expect(screen.getByRole("button", { name: "More actions for boreal" })).toHaveAttribute("aria-haspopup", "menu");
  rerender(<AllSitesTab {...initial} activatingName="atlas" />);
  expect(within(screen.getByTitle("/sites/atlas")).getByText("Saving…")).toBeInTheDocument();
  expect(within(screen.getByTitle("/sites/boreal")).queryByText("Saving…")).toBeNull();
  // 59a036e49 hides an empty overflow menu instead of rendering a disabled trigger.
  expect(screen.queryByRole("button", { name: "More actions for atlas" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "More actions for boreal" })).not.toBeInTheDocument();
  expect(onActivate).not.toHaveBeenCalled();
  rerender(<AllSitesTab {...initial} activatingName={null} />);
  expect(screen.queryByText("Saving…")).toBeNull();
  await user.click(screen.getByRole("button", { name: "More actions for boreal" }));
  await user.click(screen.getByRole("menuitem", { name: "Make default" }));
  expect(onActivate.mock.calls).toEqual([["boreal"]]);
  expect(screen.queryByRole("menu")).toBeNull();
});

it("puts the status pill on the name row with the running app as its tooltip, and no Default line", () => {
  // 2026-10-09 (owner): no status strip, no "Running in …" line, a star instead of "Default".
  const sites = [{ name: "luvira", dir: "/sites/luvira", displayName: "luvira", active: true, createdAt: "2026-09-30T00:00:00.000Z",
    running: { pid: 1, port: 3000, app: "Web", started: "2026-10-09T00:00:00.000Z", scheme: "https" as const } }];
  render(<AllSitesTab {...props({ sites, t: (key) => key,
    snapshot: { ...props().snapshot, sites, currentSite: { name: "luvira", dir: "/sites/luvira", dirOverridden: false, listed: true }, persistedSiteName: "luvira" },
  })} />);
  expect(screen.queryByText("Running in Web (port 3000)")).toBeNull();
  expect(screen.queryByRole("button", { name: "More actions for luvira" })).not.toBeInTheDocument();
  const row = screen.getByText("luvira", { selector: ".site-card-name" }).parentElement!;
  expect(row.className).toBe("site-card-title-row");
  expect(within(row).getByText("Serving now")).toHaveAttribute("title", "Running in Web (port 3000)");
  expect(within(row).getByRole("img", { name: "Opens by default" })).toBeTruthy();
  expect(screen.queryByText("Default")).toBeNull();
  expect(screen.queryByRole("button", { name: "Sites settings" })).toBeNull();
});

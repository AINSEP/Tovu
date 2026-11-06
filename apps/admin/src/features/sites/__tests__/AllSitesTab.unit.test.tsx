import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SITE_LIST_PREFS, type SiteListPrefs } from "@jini-ai/ui/site-card";
import { AllSitesTab, type AllSitesTabProps } from "../AllSitesTab";
import { staticListPrefs } from "./site-list-prefs.fixture";

function props(overrides: Partial<AllSitesTabProps> = {}): AllSitesTabProps {
  return {
    sites: [],
    snapshot: { sites: [], currentSite: { name: "live", dir: "/sites/live", dirOverridden: false, listed: true }, switchingEnabled: true, persistedSiteName: null },
    switchingEnabled: true, activatingName: null, createdName: null,
    onActivate: vi.fn(), listPrefs: staticListPrefs(), t: (key) => `translated:${key}`, ...overrides,
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
  // Make default leaves the menu meanwhile rather than showing disabled; the list's Hide stays.
  await user.click(screen.getByRole("button", { name: "More actions for boreal" }));
  expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Hide from list"]);
  await user.click(screen.getByRole("button", { name: "More actions for boreal" }));
  expect(onActivate).not.toHaveBeenCalled();
  rerender(<AllSitesTab {...initial} activatingName={null} />);
  expect(screen.queryByText("Saving…")).toBeNull();
  await user.click(screen.getByRole("button", { name: "More actions for boreal" }));
  await user.click(screen.getByRole("menuitem", { name: "Make default" }));
  expect(onActivate.mock.calls).toEqual([["boreal"]]);
  expect(screen.queryByRole("menu")).toBeNull();
});

it("puts the status on the card with the running app as its tooltip, the star on the name row, and no Default line", () => {
  // 2026-10-09 (owner): no status strip, no "Running in …" line, a star instead of "Default".
  const sites = [{ name: "luvira", dir: "/sites/luvira", displayName: "luvira", active: true, createdAt: "2026-09-30T00:00:00.000Z",
    running: { pid: 1, port: 3000, app: "Web", started: "2026-10-09T00:00:00.000Z", scheme: "https" as const } }];
  render(<AllSitesTab {...props({ sites, t: (key) => key,
    snapshot: { ...props().snapshot, sites, currentSite: { name: "luvira", dir: "/sites/luvira", dirOverridden: false, listed: true }, persistedSiteName: "luvira" },
  })} />);
  expect(screen.queryByText("Running in Web (port 3000)")).toBeNull();
  const card = within(screen.getByRole("article"));
  expect(card.getByRole("heading", { name: "luvira" }).parentElement!.className).toBe("jini-site-card__nameline");
  expect(card.getByText("Serving now")).toHaveAttribute("title", "Running in Web (port 3000)");
  expect(within(card.getByRole("heading", { name: "luvira" }).parentElement!).getByRole("img", { name: "Opens by default" })).toBeTruthy();
  expect(screen.queryByText("Default")).toBeNull();
  expect(screen.queryByRole("button", { name: "Sites settings" })).toBeNull();
});

describe("the site list's choices", () => {
  const site = (name: string, day: number) => ({ name, dir: `/sites/${name}`, displayName: name, active: false, createdAt: `2026-01-${String(day).padStart(2, "0")}T00:00:00.000Z` });
  const eight = Array.from({ length: 8 }, (_, index) => site(`s${index + 1}`, index + 1));
  const names = () => screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);

  /** Holds the choices the way the page does, so a click reaches the cards. */
  function Page({ sites, initial = {} }: { sites: AllSitesTabProps["sites"]; initial?: Partial<SiteListPrefs> }) {
    const [prefs, setPrefs] = useState<SiteListPrefs>({ ...DEFAULT_SITE_LIST_PREFS, ...initial });
    return <AllSitesTab {...props({ sites, t: (key) => key, listPrefs: staticListPrefs({ prefs, onPrefsChange: setPrefs }) })} />;
  }

  it("shows the newest six first by default, and the rest under All sites with its count", async () => {
    render(<Page sites={eight} />);
    expect(names()).toEqual(["s8", "s7", "s6", "s5", "s4", "s3"]);
    await userEvent.click(screen.getByRole("button", { name: "All sites (8)" }));
    expect(names()).toHaveLength(8);
  });

  it("re-sorts from the Sort by dropdown", async () => {
    render(<Page sites={eight.slice(0, 3)} />);
    await userEvent.selectOptions(screen.getByLabelText("Sort by"), "oldest");
    expect(names()).toEqual(["s1", "s2", "s3"]);
  });

  it("pins from the card, moving it first and keeping an old site in the default view", async () => {
    render(<Page sites={eight} initial={{ pinned: ["s1"] }} />);
    expect(names()[0]).toBe("s1");
    await userEvent.click(screen.getByRole("button", { name: "Unpin s1" }));
    expect(names()).not.toContain("s1");
    await userEvent.click(screen.getByRole("button", { name: "Pin s8" }));
    expect(screen.getByRole("button", { name: "Unpin s8" })).toHaveAttribute("aria-pressed", "true");
  });

  it("hides from the menu, keeps Delete last, and brings a site back from the Hidden filter", async () => {
    render(<Page sites={[site("a", 1), site("b", 2)]} />);
    expect(screen.queryByRole("button", { name: /Hidden/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "More actions for a" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Hide from list" }));
    expect(names()).toEqual(["b"]);
    await userEvent.click(screen.getByRole("button", { name: "Hidden (1)" }));
    expect(names()).toEqual(["a"]);
    await userEvent.click(screen.getByRole("button", { name: "More actions for a" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Show in list" }));
    expect(names()).toEqual(["b", "a"]);
    expect(screen.queryByRole("button", { name: /Hidden/ })).toBeNull();
  });

  it("says so when every site is hidden, and shows no controls with no sites at all", () => {
    const { unmount } = render(<Page sites={[site("a", 1)]} initial={{ hidden: ["a"] }} />);
    expect(screen.getByText("Every site is hidden. Open Hidden to bring one back.")).toBeInTheDocument();
    expect(screen.queryByRole("article")).toBeNull();
    unmount();
    render(<Page sites={[]} />);
    expect(screen.queryByLabelText("Sort by")).toBeNull();
  });

  it("draws no cards until the stored choices arrive, so they do not reorder", () => {
    render(<AllSitesTab {...props({ sites: [site("a", 1)], listPrefs: staticListPrefs({ ready: false }) })} />);
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("states the server's reason when the choices cannot be read or saved", () => {
    const { unmount } = render(<AllSitesTab {...props({ sites: [site("a", 1)], t: (key) => key, listPrefs: staticListPrefs({ loadError: "offline" }) })} />);
    expect(screen.getByText("Your saved list choices could not be loaded: offline. Changes apply until you reload.")).toBeInTheDocument();
    unmount();
    render(<AllSitesTab {...props({ sites: [site("a", 1)], t: (key) => key, listPrefs: staticListPrefs({ saveError: "disk full" }) })} />);
    expect(screen.getByText("Your list choices could not be saved: disk full. They apply until you reload.")).toBeInTheDocument();
  });
});

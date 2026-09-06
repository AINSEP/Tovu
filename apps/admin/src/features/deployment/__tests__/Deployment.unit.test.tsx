import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/lib/fetch-query";
import { Deployment } from "../Deployment";

/**
 * @file `Deployment` — the five-tab shell. Mounts through the REAL wired hooks (unlike
 * `OverviewTab.unit.test.tsx`/`DockerfileTab.unit.test.tsx`, which inject a fake controller
 * directly): this file exists specifically to prove the shell wires up correctly end to end, not
 * just that each tab renders in isolation. Follows `SettingsUi.unit.test.tsx`'s exact `?tab=`
 * deep-linking test shape (`tabId` prop opens directly on that tab; an unrecognized id falls back
 * to the first tab; clicking writes the new id into `window.location.search`).
 *
 * `fetch` is stubbed for every route this screen's default (Overview) tab and `useAdminLocale()`
 * touch, so every test here is deterministic and makes no real network attempt — same shim shape
 * `Integrations.unit.test.tsx` uses for its own locale call, extended to this screen's two new
 * `deployment-overview`/`dockerfile` routes.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function renderScreen(node: React.ReactElement) {
  return render(<FetchQueryProvider>{node}</FetchQueryProvider>);
}

beforeEach(() => {
  vi.stubGlobal("fetch", (url: string) => {
    const href = String(url);
    if (href.includes("/settings/effective") && href.includes("namespace=core.language")) {
      return Promise.resolve(jsonResponse({ data: [] }));
    }
    if (href.includes("/system/deployment-overview")) {
      return Promise.resolve(
        jsonResponse({
          mode: "local",
          productionReadinessGate: { applicable: false, passed: false },
          defaultOwnerPasswordUnsafe: true,
          daemonKnownFailed: false,
          dbPath: "infra/content.db",
          uploadsDir: "infra/uploads",
          envVars: [
            { name: "TOVU_ADMIN_PASSWORD", set: false },
            { name: "TOVU_ADMIN_USER", set: false },
            { name: "TOVU_INTEGRATIONS_ROOT_KEY", set: false },
            { name: "JINI_AGENT_DAEMON_PORT", set: false },
          ],
        }),
      );
    }
    if (href.includes("/system/dockerfile")) {
      return Promise.resolve(jsonResponse({ exists: false, contents: null }));
    }
    return Promise.resolve(jsonResponse({}, 404));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  // `handleTabChange` drives real `history.replaceState` via `lib/router`'s `navigate()` — reset
  // between tests so one test's tab click can't leak a `?tab=` into the next (same convention
  // `SettingsUi.unit.test.tsx` documents for the identical reason).
  window.history.replaceState(null, "", "/");
});

describe("tab bar", () => {
  it("lists all five tabs, in order", () => {
    renderScreen(<Deployment />);
    const tabs = screen.getAllByRole("tab").map((el) => el.textContent);
    expect(tabs).toEqual(["Overview", "Static Site", "Full Site", "Dockerfile", "History"]);
  });

  it("defaults to Overview when no tabId is supplied", async () => {
    renderScreen(<Deployment />);
    // Proven by the loading copy, not the resolved fetch — this test asserts which tab MOUNTED,
    // not that its data finished loading (that's `OverviewTab.unit.test.tsx`'s job).
    expect(await screen.findByText("Loading deployment status…")).toBeInTheDocument();
  });
});

describe("?tab= deep linking", () => {
  it("opens directly on the tab named by the tabId prop", () => {
    renderScreen(<Deployment tabId="static-site" />);
    expect(screen.getByText("What a static export gives you")).toBeInTheDocument();
    expect(screen.queryByText("How this instance is running")).not.toBeInTheDocument();
  });

  it("falls back to Overview for an id that names no real tab, instead of blanking the panel", async () => {
    renderScreen(<Deployment tabId="not-a-real-tab" />);
    expect(await screen.findByText("Loading deployment status…")).toBeInTheDocument();
  });

  it("switching tabs writes the new id into the URL's ?tab= so the shown tab is always the linkable one", async () => {
    const user = userEvent.setup();
    renderScreen(<Deployment tabId="static-site" />);

    await user.click(screen.getByRole("tab", { name: "History" }));

    expect(window.location.search).toBe("?tab=history");
  });

  // The URL-click test above only proves `?tab=` changes — it never re-renders `<Deployment>` with
  // the new `tabId` prop (that's `panels.tsx`'s job in the real app), so `deploymentTabPanel`'s
  // full-site/dockerfile/history branches were never actually reached by opening directly on them.
  it("opens directly on Full Site when given that tabId", () => {
    renderScreen(<Deployment tabId="full-site" />);
    expect(screen.getByText("What Full Site gives you")).toBeInTheDocument();
  });

  it("opens directly on Dockerfile when given that tabId", async () => {
    renderScreen(<Deployment tabId="dockerfile" />);
    expect(await screen.findByText("No Dockerfile yet")).toBeInTheDocument();
  });

  it("opens directly on History when given that tabId", () => {
    renderScreen(<Deployment tabId="history" />);
    expect(screen.getByText("No deploys yet")).toBeInTheDocument();
  });
});

describe("agent handles", () => {
  // Pins the ids the AI assistant relies on to see and drive this panel's header and tab bar — same
  // `data-agent-element` querying convention `PostEditor.unit.test.tsx` uses. Guards against a
  // handle silently rotting (renamed, removed, or a typo) with nothing catching it.
  it("tags the header, the tab bar container, and all five tabs", () => {
    renderScreen(<Deployment />);
    expect(document.querySelector('[data-agent-element="deployment-header"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-tab-bar"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-tab-overview"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-tab-static-site"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-tab-full-site"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-tab-dockerfile"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-tab-history"]')).toBeInTheDocument();
  });
});

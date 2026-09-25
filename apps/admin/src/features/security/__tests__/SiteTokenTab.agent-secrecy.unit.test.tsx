import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AGENT_ELEMENT_ATTRIBUTE } from "@jini-ai/agentic";
import { createDomPageDriver } from "@jini-ai/agentic/dom";

import { SiteTokenTab } from "../SiteTokenTab";
import type { SiteTokenController } from "../hooks/use-site-token.hooks";
import type { AdminSiteTokenStatus } from "@/lib/api";

/**
 * @file The Site Token is the root key. The assistant drives this page through the real page
 * driver, so it must neither be able to click Reveal nor read the value once a human has revealed
 * it — not through a handle on the value, and not through the text of any published ancestor.
 */

const HEX = "a3f9c0de5b7e41aa9d02c6b8e17f3d4c5a6b7c8d9e0f11223344556677889900";

const ACTIVE_FILE_STATUS: AdminSiteTokenStatus = {
  active: true,
  source: "file",
  fingerprint: "a1b2c3d4e5f6",
  keyFilePath: "/data/tovu/integrations-root-key",
  runtimeMode: "production",
  state: "active",
};

function makeSiteToken(overrides: Partial<SiteTokenController> = {}): SiteTokenController {
  return {
    status: ACTIVE_FILE_STATUS,
    loadError: null,
    revealing: false,
    revealError: null,
    revealedHex: null,
    reveal: async () => {},
    hideRevealed: () => {},
    generating: false,
    generateError: null,
    generate: async () => {},
    t: (key: string) => key,
    ...overrides,
  };
}

function handlesIn(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll(`[${AGENT_ELEMENT_ATTRIBUTE}]`)).map((element) => element.getAttribute(AGENT_ELEMENT_ATTRIBUTE) ?? "");
}

describe("SiteTokenTab — the root key is human-only", () => {
  it("does not publish the Reveal button to the agent", () => {
    const { container } = render(<SiteTokenTab useSiteTokenHook={() => makeSiteToken()} />);
    expect(screen.getByRole("button", { name: "Reveal" })).not.toHaveAttribute(AGENT_ELEMENT_ATTRIBUTE);
    expect(handlesIn(container)).not.toContain("security-site-token-reveal");
  });

  it("does not publish the revealed value or its Copy control", () => {
    const { container } = render(<SiteTokenTab useSiteTokenHook={() => makeSiteToken({ revealedHex: HEX })} />);
    expect(screen.getByText(HEX)).not.toHaveAttribute(AGENT_ELEMENT_ATTRIBUTE);
    expect(handlesIn(container)).not.toContain("security-site-token-reveal-value");
    expect(handlesIn(container)).not.toContain("security-site-token-copy");
  });

  it("keeps the revealed value out of everything the page driver reports, ancestors included", async () => {
    const { container } = render(<SiteTokenTab useSiteTokenHook={() => makeSiteToken({ revealedHex: HEX })} />);
    const driver = createDomPageDriver({ root: container, pages: {} });
    const found = await driver.findElements({});
    expect(found.length).toBeGreaterThan(0);
    expect(JSON.stringify(found)).not.toContain(HEX);
    for (const element of found) {
      expect(JSON.stringify(await driver.describeState?.(element.handle))).not.toContain(HEX);
    }
    expect(await driver.findElements({ query: HEX.slice(0, 16) })).toEqual([]);
  });

  it("still shows the revealed value to the human", () => {
    render(<SiteTokenTab useSiteTokenHook={() => makeSiteToken({ revealedHex: HEX })} />);
    expect(screen.getByText(HEX)).toBeVisible();
  });
});

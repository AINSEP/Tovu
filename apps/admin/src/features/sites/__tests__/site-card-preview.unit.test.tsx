import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { adminSitePreviewUrl, type AdminSitesSnapshot } from "@/lib/api";
import { AllSitesTab, type AllSitesTabProps } from "../AllSitesTab";
import { resolveSiteCardPreview } from "../hooks/use-site-card-preview.hooks";

/**
 * @file Sites card preview (2026-10-08): the URL carries the capture version, a site without a
 * capture shows its initial, and a failed image load falls back to that placeholder until a new
 * capture changes the URL. Real render, literal values, no module mocks.
 */

const SITES = [
  { name: "atlas", dir: "/sites/atlas", displayName: "atlas", active: false, createdAt: "2026-09-30T00:00:00.000Z" },
  { name: "boreal", dir: "/sites/boreal", displayName: "boreal", active: false, createdAt: "2026-09-30T00:00:00.000Z" },
];

function snapshot(previewVersions?: Record<string, number>): AdminSitesSnapshot {
  return { sites: SITES, previewVersions, currentSite: { name: "atlas", dir: "/sites/atlas", dirOverridden: false, listed: true }, switchingEnabled: true, persistedSiteName: null };
}

function props(previewVersions?: Record<string, number>): AllSitesTabProps {
  return { sites: SITES, snapshot: snapshot(previewVersions), switchingEnabled: true, activatingName: null, createdName: null, onActivate: vi.fn(), t: (key) => key };
}

describe("resolveSiteCardPreview", () => {
  it("builds the versioned, encoded admin preview URL", () => {
    expect(adminSitePreviewUrl({ name: "atlas", version: 1728388800123.5 }))
      .toBe("/api/admin/v1/workspaces/workspace-local/system/sites/atlas/preview?v=1728388800123.5");
    expect(resolveSiteCardPreview({ site: { name: "atlas" }, snapshot: { previewVersions: { atlas: 7 } } }, { urlFor: ({ name, version }) => `${name}#${version}` }))
      .toEqual({ src: "atlas#7", initial: "A" });
  });

  it("is a placeholder without a version for this site, or from an older server without the field", () => {
    expect(resolveSiteCardPreview({ site: { name: "boreal" }, snapshot: { previewVersions: { atlas: 7 } } })).toEqual({ src: null, initial: "B" });
    expect(resolveSiteCardPreview({ site: { name: "atlas" }, snapshot: {} })).toEqual({ src: null, initial: "A" });
  });
});

describe("Sites card preview band", () => {
  it("renders a lazy decorative image for a captured site and the initial for one without a capture", () => {
    const { container } = render(<AllSitesTab {...props({ atlas: 7 })} />);
    const bands = container.querySelectorAll(".site-card-preview");
    expect(bands).toHaveLength(2);
    const image = bands[0]!.querySelector("img")!;
    expect(image.getAttribute("src")).toBe("/api/admin/v1/workspaces/workspace-local/system/sites/atlas/preview?v=7");
    expect(image.getAttribute("alt")).toBe("");
    expect(image.getAttribute("loading")).toBe("lazy");
    expect(bands[0]!.getAttribute("aria-hidden")).toBe("true");
    expect(bands[1]!.querySelector("img")).toBeNull();
    expect(bands[1]!.textContent).toBe("B");
    // The band precedes the status strip, so the picture sits on top of the card.
    expect(bands[0]!.nextElementSibling?.className).toBe("site-card-head");
  });

  it("swaps a failed image for the placeholder until a new capture changes the URL", () => {
    const { container, rerender } = render(<AllSitesTab {...props({ atlas: 7 })} />);
    fireEvent.error(container.querySelector(".site-card-preview img")!);
    expect(container.querySelector(".site-card-preview img")).toBeNull();
    expect(container.querySelector(".site-card-preview")!.textContent).toBe("A");
    rerender(<AllSitesTab {...props({ atlas: 8 })} />);
    expect(container.querySelector(".site-card-preview img")!.getAttribute("src")).toBe("/api/admin/v1/workspaces/workspace-local/system/sites/atlas/preview?v=8");
  });
});

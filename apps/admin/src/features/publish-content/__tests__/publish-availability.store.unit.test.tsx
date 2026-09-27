import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PublishSectionButton } from "../PublishSectionButton";
import {
  isPublishToLiveAvailable,
  readPublishToLiveAvailability,
  setPublishToLiveAvailable,
} from "../hooks/publish-availability.store";
import { requestPublish } from "../hooks/publish-request.store";

/**
 * @file Hide-Publish-on-the-live-site — the one flag every Publish entry point reads. The live site
 * (`TOVU_RUNTIME_MODE=production`) answers `/auth/me` with `canPublishToLive: false`; everywhere
 * else (and any older server without the field) Publish stays available.
 */
describe("publish-availability store", () => {
  afterEach(() => setPublishToLiveAvailable(true));

  it("reads /auth/me's canPublishToLive, treating an absent field as available", () => {
    expect(readPublishToLiveAvailability({ canPublishToLive: false })).toBe(false);
    expect(readPublishToLiveAvailability({ canPublishToLive: true })).toBe(true);
    expect(readPublishToLiveAvailability({})).toBe(true);
  });

  it("defaults to available", () => {
    expect(isPublishToLiveAvailable()).toBe(true);
  });

  it("hides a section's Publish button on the live site", () => {
    setPublishToLiveAvailable(false);
    render(<PublishSectionButton section="pages" />);
    expect(screen.queryByRole("button", { name: "Publish pages" })).toBeNull();
  });

  it("still renders a section's Publish button everywhere else", () => {
    render(<PublishSectionButton section="pages" />);
    expect(screen.getByRole("button", { name: "Publish pages" })).toBeInTheDocument();
  });

  it("requestPublish (deep link, chat, WebMCP) never opens the dialog on the live site", async () => {
    setPublishToLiveAvailable(false);
    const result = await requestPublish({});
    expect(result.opened).toBe(false);
    expect(result.planned).toBe(false);
    expect(result.nextStep).toBe(
      "This is the live site, so there is nowhere to publish to. Publish from your local copy of the site instead."
    );
  });
});

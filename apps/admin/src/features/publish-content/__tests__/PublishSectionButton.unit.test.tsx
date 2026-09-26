import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PublishSectionButton } from "../PublishSectionButton";
import * as publishRequestStore from "../hooks/publish-request.store";

/**
 * @file `plan-publish-sections-2026-09-25.md` §2 S3 — pins the button's exact label per section and
 * that a click opens the dialog scoped to that one entity type, via the real `requestPublish` (spied
 * on, not faked, so this also proves the hook calls the SAME store S1/S2 wired rather than a second
 * path). Locale resolution (`useWiredAdminLocale`) is left real — `use-admin-locale.hooks.ts`
 * degrades to the `DEFAULT_LOCALE` ("en") default on a failed/absent fetch, which is what jsdom
 * gives it here with no `fetch` stub, matching every English-literal assertion below.
 */
describe("PublishSectionButton", () => {
  it.each([
    ["page", "Publish pages"],
    ["post", "Publish posts"],
    ["media", "Publish media"],
    ["menu", "Publish menus"],
    ["redirect", "Publish redirects"],
    ["theme-files", "Publish themes"],
  ] as const)("renders the %s section's own label", (entityType, label) => {
    render(<PublishSectionButton entityType={entityType} />);
    expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
  });

  // Every section, not just one: a hook that scoped every button to the same type would pass a
  // single-type check while "Publish themes" opened a pages-only dialog.
  it.each([
    ["page", "Publish pages"],
    ["post", "Publish posts"],
    ["media", "Publish media"],
    ["menu", "Publish menus"],
    ["redirect", "Publish redirects"],
    ["theme-files", "Publish themes"],
  ] as const)("clicking the %s section's button opens the dialog scoped to just that entity type", async (entityType, label) => {
    const user = userEvent.setup();
    const requestPublishSpy = vi.spyOn(publishRequestStore, "requestPublish").mockResolvedValue({
      opened: true,
      planned: false,
      site: null,
      willPublish: [],
      willOverwrite: [],
      leftAlone: [],
      unmatchedItems: [],
      unknownTypes: [],
      nextStep: "",
    });

    render(<PublishSectionButton entityType={entityType} />);
    await user.click(screen.getByRole("button", { name: label }));

    expect(requestPublishSpy).toHaveBeenCalledTimes(1);
    expect(requestPublishSpy).toHaveBeenCalledWith({}, { entityTypes: [entityType] });
    requestPublishSpy.mockRestore();
  });
});

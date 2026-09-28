import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useProviders } from "../use-providers.hooks";

/**
 * @file `useProviders` — the Providers page's controller.
 *
 * The "composed sub-controllers are present" case below MOVED here unchanged (2026-09-10) from
 * `features/settings/hooks/__tests__/use-settings-ui.unit.test.ts`, when the External MCP tab
 * (and the since-removed Composio tab) left the Settings page for their own nav row. Same assertion, same guarantee — only its
 * owner changed.
 */

describe("useProviders — composed sub-controllers are present", () => {
  it("wires externalMcp as a real controller, not a stub", () => {
    const { result } = renderHook(() => useProviders());
    expect(result.current.externalMcp).toHaveProperty("dependencies");
    expect(result.current.externalMcp).toHaveProperty("restartRequired");
  });
});

describe("useProviders — mounts ONLY what the Providers page reads", () => {
  it("exposes no settings-ledger slices", () => {
    // The reason this hook exists rather than reusing `useSettingsUi` (see its own doc comment):
    // that hook mounts six `useSettingsSlice` instances — execution, instructions, notifications,
    // privacy, appearance, language — none of which any tab on this page displays. Reusing it
    // would have made opening Providers fetch five namespaces it never shows AND gated the render
    // on `areAnySlicesLoading`, so one slow unrelated namespace would hold the External MCP panel
    // blank. This asserts that separation rather than trusting the comment.
    const { result } = renderHook(() => useProviders());

    expect(Object.keys(result.current).sort()).toEqual(["externalMcp"]);
    for (const sliceField of ["execution", "instructions", "notifications", "privacy", "appearance", "language", "save", "loading"]) {
      expect(result.current).not.toHaveProperty(sliceField);
    }
  });
});

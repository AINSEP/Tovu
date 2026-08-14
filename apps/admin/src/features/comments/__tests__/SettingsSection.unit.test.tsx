import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SettingsSection } from "../Comments";
import type { CommentSettingsController } from "../hooks/use-comment-settings.hooks";
import type { CommentsSettings } from "../../../lib/api";

/**
 * @file First direct test for `SettingsSection` (previously module-private, only reachable through
 * `Comments`'s own render tree — `Comments.unit.test.tsx` keeps the full round-trip coverage). See
 * `QueueSection.unit.test.tsx`'s header for the shared rationale — same `AdminExecutionMode.unit
 * .test.tsx` precedent, same "renders from the injected fake, not a real round trip" assertion.
 */

const SETTINGS: CommentsSettings = {
  enabled: true,
  requireModeration: true,
  maxDepth: 5,
  closeAfterDays: null,
  spamAutoRejectScore: 0.9,
  maxPerIpPerHour: 10,
};

function fakeController(overrides: Partial<CommentSettingsController> = {}): CommentSettingsController {
  return {
    settings: SETTINGS,
    error: null,
    saving: false,
    notice: null,
    save: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("SettingsSection — useCommentSettingsHook injection", () => {
  it("renders the settings form from the injected fake, with no fetch involved", () => {
    render(<SettingsSection canConfigure locale="en" useCommentSettingsHook={() => fakeController()} />);

    // The real hook always starts `settings: null` until the load settles — the form (and its
    // seeded `enabled` checkbox) appearing synchronously, with no `fetch` mocked anywhere in this
    // file, is only possible via the fake.
    expect(screen.getByRole("checkbox", { name: /comments enabled/i })).toBeChecked();
  });

  it("shows the loading notice from the injected fake when settings is still null", () => {
    render(
      <SettingsSection canConfigure locale="en" useCommentSettingsHook={() => fakeController({ settings: null })} />,
    );

    expect(screen.getByText(/loading comments settings/i)).toBeInTheDocument();
  });

  it("renders nothing when canConfigure is false, regardless of the fake controller", () => {
    const { container } = render(
      <SettingsSection canConfigure={false} locale="en" useCommentSettingsHook={() => fakeController()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

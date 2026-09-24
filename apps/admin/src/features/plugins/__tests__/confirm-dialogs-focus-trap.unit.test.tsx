import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PluginRemoveConfirmDialog } from "../PluginRemoveConfirmDialog";
import { AgentPluginDisableConfirmDialog } from "../AgentPluginDisableConfirmDialog";
import { tabFromLastFocusableInDialog } from "@/hooks/__tests__/focus-trap.test-helpers";

/**
 * @file 2026-09-20 platform review, Finding 4: `PluginRemoveConfirmDialog` and
 * `AgentPluginDisableConfirmDialog` both declare `role="dialog" aria-modal="true"` — a hand-rolled
 * div dialog copied from `features/settings/ExternalMcpRemoveConfirmDialog.tsx` — but their paired
 * hooks only ever listened for Escape, so the browser gave them no Tab containment at all: Tab from
 * the last focusable control walked straight out onto the page behind the backdrop.
 *
 * Both dialogs now consume the shared `useFocusTrap` primitive (`ebcda9aae`) from their own paired
 * hook, mirroring `MediaEditDialog.unit.test.tsx`'s own "focus trap" describe and its
 * `tabFromLastFocusableInDialog` helper — same fixture, applied to these two dialogs.
 */

describe("PluginRemoveConfirmDialog — focus trap", () => {
  it("keeps Tab inside the dialog: Tab on the last focusable element wraps to the first", () => {
    render(
      <>
        <button>Behind</button>
        <PluginRemoveConfirmDialog
          name="Site Compliance"
          agentHandleBase="row-x"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          t={(k) => k}
        />
      </>,
    );
    const { event, first } = tabFromLastFocusableInDialog();

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it("Shift+Tab from the first focusable element wraps to the last", () => {
    render(
      <>
        <button>Behind</button>
        <PluginRemoveConfirmDialog
          name="Site Compliance"
          agentHandleBase="row-x"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          t={(k) => k}
        />
      </>,
    );
    const dialog = screen.getByRole("dialog");
    const focusable = dialog.querySelectorAll<HTMLElement>(
      "a[href],button:not([disabled]),input:not([disabled]):not([type='hidden']),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])",
    );
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    first.focus();
    const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    first.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });
});

describe("AgentPluginDisableConfirmDialog — focus trap", () => {
  it("keeps Tab inside the dialog: Tab on the last focusable element wraps to the first", () => {
    render(
      <>
        <button>Behind</button>
        <AgentPluginDisableConfirmDialog
          name="Site Compliance"
          variant="disable"
          agentHandleBase="row-x"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          t={(k) => k}
        />
      </>,
    );
    const { event, first } = tabFromLastFocusableInDialog();

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it("Shift+Tab from the first focusable element wraps to the last", () => {
    render(
      <>
        <button>Behind</button>
        <AgentPluginDisableConfirmDialog
          name="Site Compliance"
          variant="disable"
          agentHandleBase="row-x"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          t={(k) => k}
        />
      </>,
    );
    const dialog = screen.getByRole("dialog");
    const focusable = dialog.querySelectorAll<HTMLElement>(
      "a[href],button:not([disabled]),input:not([disabled]):not([type='hidden']),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])",
    );
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    first.focus();
    const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    first.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });
});

describe("plugin uninstall/turn-off dialogs — confirm is human-only", () => {
  it("PluginRemoveConfirmDialog publishes Cancel but never Confirm", () => {
    render(<PluginRemoveConfirmDialog name="Site Compliance" agentHandleBase="row-x" onConfirm={vi.fn()} onCancel={vi.fn()} t={(k) => k} />);
    expect(screen.getByRole("button", { name: "Move to trash" })).not.toHaveAttribute("data-agent-element");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute("data-agent-element", "row-x-remove-cancel");
  });

  it.each(["remove", "disable"] as const)("AgentPluginDisableConfirmDialog (%s) publishes Cancel but never Confirm", (variant) => {
    const { container } = render(
      <AgentPluginDisableConfirmDialog variant={variant} name="Site Compliance" agentHandleBase="row-x" onConfirm={vi.fn()} onCancel={vi.fn()} t={(k) => k} />,
    );
    expect(container.ownerDocument.querySelector(`[data-agent-element="row-x-${variant}-confirm"]`)).toBeNull();
    expect(container.ownerDocument.querySelector(`[data-agent-element="row-x-${variant}-cancel"]`)).not.toBeNull();
  });
});

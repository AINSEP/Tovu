import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InfoTip } from "../InfoTip";
import { SeeMore } from "../SeeMore/SeeMore";
import { Select, type SelectOption } from "../Select/Select";
import { ImagePreviewModal } from "../ImagePreviewModal";
import { AdminByokKeyFooter, AdminByokMigrationPrompt, AdminByokSettingsFooter } from "../AdminByokKeyPanel";
import { ComingSoonNotice, Placeholder } from "../Placeholder";
import type { AdminExecutionCredentialController } from "../../hooks/use-admin-execution-credential.hooks";

/**
 * @file Batch 1 of the shared `components/` pass-through `agentHandle` prop: `InfoTip`, `SeeMore`,
 * `Select`, `ImagePreviewModal`, `AdminByokKeyPanel` (`AdminByokMigrationPrompt`/`AdminByokKeyFooter`),
 * and `Placeholder`/`ComingSoonNotice`.
 *
 * Each component here is otherwise covered by its own existing suite (behavior, ARIA, hook
 * injection) — this file only pins the one property that makes this whole workstream safe to land
 * alongside other in-flight screen work: omitting `agentHandle` emits zero `data-agent-*` markup
 * (byte-identical to before this prop existed), and supplying it publishes the handle on the real
 * interactive element — never a wrapper — with the caller's own name, not a hardcoded one.
 */

const AGENT_ELEMENT = "data-agent-element";
const AGENT_ROLE = "data-agent-role";
const AGENT_LABEL = "data-agent-label";

function controller(overrides: Partial<AdminExecutionCredentialController> = {}): AdminExecutionCredentialController {
  return {
    stored: null,
    apiKeyStoredExternally: false,
    apiKeyPlaceholder: undefined,
    saveState: { status: "idle" },
    settingsSaveState: { status: "idle" },
    canSaveKey: true,
    saveKey: vi.fn(),
    saveSettings: vi.fn(),
    legacyKey: null,
    migrateLegacyKey: vi.fn(),
    dismissLegacyPrompt: vi.fn(),
    ...overrides,
  };
}

describe("InfoTip agentHandle", () => {
  it("omits all data-agent-* markup when agentHandle is not passed", () => {
    render(<InfoTip label="Explain this" />);
    expect(screen.getByLabelText("Explain this")).not.toHaveAttribute(AGENT_ELEMENT);
  });

  it("publishes the icon itself, using the caller's own handle and label", () => {
    render(<InfoTip label="Explain this" agentHandle="field-hint" />);
    const icon = screen.getByLabelText("Explain this");
    expect(icon).toHaveAttribute(AGENT_ELEMENT, "field-hint");
    expect(icon).toHaveAttribute(AGENT_ROLE, "button");
    expect(icon).toHaveAttribute(AGENT_LABEL, "Explain this");
  });

  it("throws for a caller handle outside the lowercase-hyphen alphabet — never silently sanitized", () => {
    expect(() => render(<InfoTip label="Explain this" agentHandle="Bad Handle!" />)).toThrow();
  });
});

describe("SeeMore agentHandle", () => {
  // jsdom reports zero layout, so the toggle only renders once useClamp says the text overflows —
  // same fake-hook injection every other SeeMore suite in this repo uses for the same reason.
  const overflowingClamp = () => ({
    expanded: false,
    setExpanded: () => {},
    overflows: true,
    textRef: { current: null },
    regionId: "region-1",
    lineCount: 2,
  });

  it("omits data-agent-* on the toggle when agentHandle is not passed", () => {
    render(<SeeMore useClamp={overflowingClamp}>Some long text.</SeeMore>);
    expect(screen.getByRole("button")).not.toHaveAttribute(AGENT_ELEMENT);
  });

  it("publishes the toggle button under the caller's own handle", () => {
    render(
      <SeeMore useClamp={overflowingClamp} agentHandle="field-hint-more">
        Some long text.
      </SeeMore>,
    );
    const toggle = screen.getByRole("button");
    expect(toggle).toHaveAttribute(AGENT_ELEMENT, "field-hint-more");
    expect(toggle).toHaveAttribute(AGENT_ROLE, "button");
  });
});

const SELECT_OPTIONS: SelectOption[] = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Bravo" },
];

describe("Select agentHandle", () => {
  it("omits data-agent-* everywhere (trigger, search, options) when agentHandle is not passed", async () => {
    const user = userEvent.setup();
    render(<Select value="" onChange={() => {}} options={SELECT_OPTIONS} aria-label="Pick one" />);
    const trigger = screen.getByRole("combobox", { name: "Pick one" });
    expect(trigger).not.toHaveAttribute(AGENT_ELEMENT);

    await user.click(trigger);
    for (const option of screen.getAllByRole("option")) {
      expect(option).not.toHaveAttribute(AGENT_ELEMENT);
    }
  });

  it("publishes the trigger under the base handle, and each option under its own value-derived sub-handle", async () => {
    const user = userEvent.setup();
    render(<Select value="" onChange={() => {}} options={SELECT_OPTIONS} aria-label="Pick one" agentHandle="widget-type" />);
    const trigger = screen.getByRole("combobox", { name: "Pick one" });
    expect(trigger).toHaveAttribute(AGENT_ELEMENT, "widget-type");
    expect(trigger).toHaveAttribute(AGENT_ROLE, "button");

    await user.click(trigger);
    expect(screen.getByRole("option", { name: "Alpha" })).toHaveAttribute(AGENT_ELEMENT, "widget-type-option-a");
    expect(screen.getByRole("option", { name: "Bravo" })).toHaveAttribute(AGENT_ELEMENT, "widget-type-option-b");
  });

  it("selecting an option by its published handle still fires onChange with that option's real value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select value="" onChange={onChange} options={SELECT_OPTIONS} aria-label="Pick one" agentHandle="widget-type" />);
    await user.click(screen.getByRole("combobox", { name: "Pick one" }));
    await user.click(screen.getByRole("option", { name: "Bravo" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});

describe("ImagePreviewModal agentHandle", () => {
  it("omits data-agent-* on the close button when agentHandle is not passed", () => {
    render(<ImagePreviewModal open={true} src="/x.png" alt="x" onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Close preview" })).not.toHaveAttribute(AGENT_ELEMENT);
  });

  it("publishes the close button under the caller's own handle", () => {
    render(<ImagePreviewModal open={true} src="/x.png" alt="x" onClose={vi.fn()} agentHandle="preview-close" />);
    const close = screen.getByRole("button", { name: "Close preview" });
    expect(close).toHaveAttribute(AGENT_ELEMENT, "preview-close");
    expect(close).toHaveAttribute(AGENT_ROLE, "button");
  });
});

describe("AdminByokMigrationPrompt agentHandle", () => {
  it("omits data-agent-* on both buttons when agentHandle is not passed", () => {
    render(<AdminByokMigrationPrompt controller={controller({ legacyKey: "sk-legacy" })} />);
    expect(screen.getByRole("button", { name: /save to my account/i })).not.toHaveAttribute(AGENT_ELEMENT);
    expect(screen.getByRole("button", { name: /not now/i })).not.toHaveAttribute(AGENT_ELEMENT);
  });

  it("derives distinct -save/-dismiss sub-handles from the one base the caller supplies", () => {
    render(<AdminByokMigrationPrompt controller={controller({ legacyKey: "sk-legacy" })} agentHandle="byok-migration" />);
    expect(screen.getByRole("button", { name: /save to my account/i })).toHaveAttribute(AGENT_ELEMENT, "byok-migration-save");
    expect(screen.getByRole("button", { name: /not now/i })).toHaveAttribute(AGENT_ELEMENT, "byok-migration-dismiss");
  });
});

describe("AdminByokKeyFooter agentHandle", () => {
  it("omits data-agent-* on the Save key button when agentHandle is not passed", () => {
    render(<AdminByokKeyFooter controller={controller()} />);
    expect(screen.getByRole("button", { name: /save key/i })).not.toHaveAttribute(AGENT_ELEMENT);
  });

  it("publishes the single Save key button directly under the caller's base handle (no suffix)", () => {
    render(<AdminByokKeyFooter controller={controller()} agentHandle="byok-footer" />);
    expect(screen.getByRole("button", { name: /save key/i })).toHaveAttribute(AGENT_ELEMENT, "byok-footer");
  });
});

/**
 * Coverage-gap-fill (2026-09-05). `AdminByokSettingsFooter` — the sibling footer this file's own
 * header names alongside `AdminByokKeyFooter` — was never actually imported or tested here; its own
 * `agentHandle` ternary had no coverage at all.
 */
describe("AdminByokSettingsFooter agentHandle", () => {
  it("omits data-agent-* on the Save settings button when agentHandle is not passed", () => {
    render(<AdminByokSettingsFooter controller={controller()} />);
    expect(screen.getByRole("button", { name: /save settings/i })).not.toHaveAttribute(AGENT_ELEMENT);
  });

  it("publishes the single Save settings button directly under the caller's base handle (no suffix)", () => {
    render(<AdminByokSettingsFooter controller={controller()} agentHandle="byok-settings-footer" />);
    expect(screen.getByRole("button", { name: /save settings/i })).toHaveAttribute(AGENT_ELEMENT, "byok-settings-footer");
  });
});

describe("Placeholder / ComingSoonNotice agentHandle", () => {
  it("omits data-agent-* on the coming-soon notice when agentHandle is not passed", () => {
    render(<Placeholder sectionId="newsletter" />);
    expect(screen.getByText("Newsletter is coming soon.").closest(".page")).not.toHaveAttribute(AGENT_ELEMENT);
  });

  it("publishes the coming-soon notice as a status region under the caller's handle", () => {
    render(<Placeholder sectionId="newsletter" agentHandle="newsletter-page" />);
    const page = screen.getByText("Newsletter is coming soon.").closest(".page");
    expect(page).toHaveAttribute(AGENT_ELEMENT, "newsletter-page");
    expect(page).toHaveAttribute(AGENT_ROLE, "status");
  });

  it("also publishes the Unknown section branch under the same prop", () => {
    render(<Placeholder sectionId="does-not-exist-12345" agentHandle="unknown-notice" />);
    expect(screen.getByText(/unknown section/i)).toHaveAttribute(AGENT_ELEMENT, "unknown-notice");
  });

  it("ComingSoonNotice itself omits data-agent-* when called directly with no handle", () => {
    render(<ComingSoonNotice kicker="People" label="Newsletter" />);
    expect(screen.getByText("Newsletter is coming soon.").closest(".page")).not.toHaveAttribute(AGENT_ELEMENT);
  });
});

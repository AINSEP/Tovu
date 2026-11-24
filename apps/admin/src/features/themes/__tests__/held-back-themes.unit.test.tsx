import { act, fireEvent, render, screen, waitFor, within } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { HeldBackTheme } from "../api/held-back-themes-api";
import type { PresentationSettings } from "../api/themes-api.types";
import { HeldBackChosenThemeNotice, HeldBackThemes } from "../HeldBackThemes";
import { createFakeHeldBackThemesPort, heldBackApiError } from "../hooks/held-back-themes-dependencies.hooks";
import type { HeldBackThemesPort } from "../hooks/held-back-themes-port.hooks";
import { useHeldBackThemes } from "../hooks/use-held-back-themes.hooks";
import { Themes } from "../Themes";
import type { ThemesController } from "../hooks/use-themes.hooks";

/**
 * @file The "Held back on import" section and its chosen-theme notice (A452), driven through the
 * real `useHeldBackThemes` hook over a fake port, so the screen's behaviour is asserted end to end
 * without a network. Test names start `held back on import:` so the four contract cases are easy to find.
 */

const identity = (key: string): string => key;
const FOO: HeldBackTheme = { id: "static/foo", name: "Foo Theme", tier: "static", original: false, files: 12, bytes: 20480 };
const BAR: HeldBackTheme = { id: "declarative/bar", name: "Bar Theme", tier: "declarative", original: true, files: 1, bytes: 300 };

function Harness({ port, onRestored = vi.fn() }: { port: HeldBackThemesPort; onRestored?: () => void }) {
  const heldBack = useHeldBackThemes({ port, t: identity, onRestored });
  return (
    <>
      <HeldBackChosenThemeNotice chosenThemeHeldBack={heldBack.status === "ready" ? heldBack.chosenThemeHeldBack : null} themeNames={{ starter: "Starter" }} t={identity} />
      <HeldBackThemes controller={heldBack} t={identity} />
    </>
  );
}

async function renderReady(port: HeldBackThemesPort, onRestored?: () => void) {
  const user = userEvent.setup();
  const view = render(<Harness port={port} onRestored={onRestored} />);
  await waitFor(() => expect(screen.queryByText("Loading held-back themes…")).not.toBeInTheDocument());
  return { user, ...view };
}

describe("held back on import: section", () => {
  it("held back on import: lists the held-back themes", async () => {
    await renderReady(createFakeHeldBackThemesPort({ themes: [BAR, FOO] }));
    const section = screen.getByRole("region", { name: "Held back on import" });
    const items = within(section).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("Bar Theme")).toBeInTheDocument();
    expect(items[0]).toHaveTextContent("Declarative · From your original themes · 1 file, 0.3 KB");
    expect(within(items[1]!).getByText("Foo Theme")).toBeInTheDocument();
    expect(items[1]).toHaveTextContent("Static · 12 files, 20 KB");
    expect(within(items[1]!).getByRole("button", { name: "Check Foo Theme" })).toBeEnabled();
    expect(within(items[1]!).queryByRole("button", { name: /^Restore/ })).not.toBeInTheDocument();
  });

  it("held back on import: renders nothing when the list is empty", async () => {
    const { container } = await renderReady(createFakeHeldBackThemesPort({ themes: [] }));
    expect(container).toBeEmptyDOMElement();
  });

  it("held back on import: renders nothing when the list is refused with 403 or 404", async () => {
    for (const status of [403, 404]) {
      const port = createFakeHeldBackThemesPort();
      port.list = vi.fn(async () => { throw heldBackApiError({ status, code: "FORBIDDEN", message: "no" }); });
      const view = await renderReady(port);
      expect(view.container).toBeEmptyDOMElement();
      view.unmount();
    }
  });

  it("held back on import: a failed list shows the server message with a Retry that reloads", async () => {
    const port = createFakeHeldBackThemesPort({ themes: [FOO] });
    const list = vi.spyOn(port, "list").mockRejectedValueOnce(heldBackApiError({ status: 500, code: "INTERNAL", message: "disk is sad", errorId: "ERR-ABC123" }));
    const { user } = await renderReady(port);
    expect(screen.getByRole("alert")).toHaveTextContent("disk is sad");
    expect(screen.getByRole("alert")).toHaveTextContent("ERR-ABC123");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Foo Theme")).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("held back on import: shows a loading state first", () => {
    const port = createFakeHeldBackThemesPort({ themes: [FOO] });
    port.list = () => new Promise(() => {});
    render(<Harness port={port} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading held-back themes…");
  });
});

describe("held back on import: check", () => {
  it("held back on import: re-check refused on a still-bad manifest shows the problems and no Restore", async () => {
    const port = createFakeHeldBackThemesPort({
      themes: [FOO],
      checkResults: { "static/foo": { themeId: "static/foo", passes: false, problems: ["theme.json cannot be read", "run.php is not a supported file"], digest: null, nameTaken: false, approval: null } },
    });
    const { user } = await renderReady(port);
    await user.click(screen.getByRole("button", { name: "Check Foo Theme" }));
    const problems = await screen.findByText("Still fails the safety checks, so it stays held back:");
    const row = problems.closest("li") as HTMLElement;
    expect(within(row).getByText("theme.json cannot be read")).toBeInTheDocument();
    expect(within(row).getByText("run.php is not a supported file")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /^Restore/ })).not.toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Check again Foo Theme" })).toBeEnabled();
  });

  it("held back on import: a passing check announces it and offers Restore…", async () => {
    const { user } = await renderReady(createFakeHeldBackThemesPort({ themes: [FOO] }));
    await user.click(screen.getByRole("button", { name: "Check Foo Theme" }));
    expect(await screen.findByText("Passed the safety checks. You can restore it.")).toBeInTheDocument();
    // The result lands in a polite live region so a screen reader hears it.
    expect(screen.getByText("Passed the safety checks. You can restore it.").closest("[role=status]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Restore… Foo Theme" })).toBeEnabled();
  });

  it("held back on import: a passing check on a taken name gives the reason instead of an enabled Restore", async () => {
    const port = createFakeHeldBackThemesPort({
      themes: [FOO],
      checkResults: { "static/foo": { themeId: "static/foo", passes: true, problems: [], digest: "d1", nameTaken: true, approval: null } },
    });
    const { user } = await renderReady(port);
    await user.click(screen.getByRole("button", { name: "Check Foo Theme" }));
    const button = await screen.findByRole("button", { name: "Restore… Foo Theme" });
    expect(button).toBeDisabled();
    expect(screen.getByText("A theme with this name is already installed, so this one can't be restored.")).toBeInTheDocument();
  });

  it("held back on import: shows a busy, disabled Check while checking", async () => {
    const port = createFakeHeldBackThemesPort({ themes: [FOO] });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const real = port.check.bind(port);
    port.check = async (required) => { await gate; return real(required); };
    const { user } = await renderReady(port);
    await user.click(screen.getByRole("button", { name: "Check Foo Theme" }));
    const busy = await screen.findByRole("button", { name: "Checking… Foo Theme" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    await act(async () => { release(); await gate; });
    expect(await screen.findByText("Passed the safety checks. You can restore it.")).toBeInTheDocument();
  });
});

describe("held back on import: restore", () => {
  it("held back on import: restore requires approval", async () => {
    const port = createFakeHeldBackThemesPort({ themes: [FOO, BAR] });
    const restore = vi.spyOn(port, "restore");
    const approveRestore = vi.spyOn(port, "approveRestore");
    const onRestored = vi.fn();
    const { user } = await renderReady(port, onRestored);
    await user.click(screen.getByRole("button", { name: "Check Foo Theme" }));
    await user.click(await screen.findByRole("button", { name: "Restore… Foo Theme" }));

    // The approval card opens and nothing has been restored yet.
    const dialog = screen.getByText("Restore Foo Theme?").closest("dialog") as HTMLElement;
    expect(dialog).toHaveAttribute("open");
    expect(within(dialog).getByText("It becomes a normal theme and stays switched off until you activate it. Nothing is deleted.")).toBeInTheDocument();
    expect(restore).not.toHaveBeenCalled();

    // Cancelling asks the server for NO approval and calls NO restore.
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(approveRestore).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
    expect(onRestored).not.toHaveBeenCalled();

    // Confirming records the approval on the server for the checked plan, then restores with the
    // digest (version check) AND the server-minted approval token — the digest alone is not approval.
    await user.click(screen.getByRole("button", { name: "Restore… Foo Theme" }));
    const second = screen.getByText("Restore Foo Theme?").closest("dialog") as HTMLElement;
    await user.click(within(second).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(approveRestore).toHaveBeenCalledWith({ themeId: "static/foo", planId: "plan-static/foo", planHash: "hash-static/foo" }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith({ themeId: "static/foo", approvedDigest: "digest-static/foo", confirmationToken: "token-static/foo" }));
    await waitFor(() => expect(onRestored).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Restored "Foo Theme". It is switched off until you activate it.')).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check Foo Theme" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check Bar Theme" })).toBeInTheDocument();
  });

  it("held back on import: a refused restore shows the plain-words message on that row", async () => {
    const port = createFakeHeldBackThemesPort({ themes: [FOO] });
    vi.spyOn(port, "restore").mockRejectedValueOnce(heldBackApiError({ status: 409, code: "NAME_TAKEN", message: "x" }));
    const { user } = await renderReady(port);
    await user.click(screen.getByRole("button", { name: "Check Foo Theme" }));
    await user.click(await screen.findByRole("button", { name: "Restore… Foo Theme" }));
    await user.click(within(screen.getByText("Restore Foo Theme?").closest("dialog") as HTMLElement).getByRole("button", { name: "Restore" }));
    expect(await screen.findByText("A theme with this name is already installed, so this one can't be restored.")).toBeInTheDocument();
  });

  it("held back on import: restoring the last theme still confirms it after the section empties", async () => {
    const port = createFakeHeldBackThemesPort({ themes: [FOO] });
    const { user } = await renderReady(port);
    await user.click(screen.getByRole("button", { name: "Check Foo Theme" }));
    await user.click(await screen.findByRole("button", { name: "Restore… Foo Theme" }));
    await user.click(within(screen.getByText("Restore Foo Theme?").closest("dialog") as HTMLElement).getByRole("button", { name: "Restore" }));
    expect(await screen.findByText('Restored "Foo Theme". It is switched off until you activate it.')).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Held back on import" })).not.toBeInTheDocument();
  });

  it("held back on import: marks the row busy while restoring", async () => {
    const port = createFakeHeldBackThemesPort({ themes: [FOO] });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const real = port.restore.bind(port);
    port.restore = async (required) => { await gate; return real(required); };
    const { user } = await renderReady(port);
    await user.click(screen.getByRole("button", { name: "Check Foo Theme" }));
    await user.click(await screen.findByRole("button", { name: "Restore… Foo Theme" }));
    await user.click(within(screen.getByText("Restore Foo Theme?").closest("dialog") as HTMLElement).getByRole("button", { name: "Restore" }));
    const busy = await screen.findByRole("button", { name: "Restoring… Foo Theme" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    await act(async () => { release(); await gate; });
    expect(await screen.findByText('Restored "Foo Theme". It is switched off until you activate it.')).toBeInTheDocument();
  });
});

describe("held back on import: chosen-theme notice", () => {
  it("held back on import: notice shown when the chosen theme was held back", async () => {
    const port = createFakeHeldBackThemesPort({
      themes: [FOO],
      chosenThemeHeldBack: { themeId: "static/foo", name: "Foo Theme", fallbackThemeId: "starter" },
    });
    await renderReady(port);
    const notice = screen.getByText(/was held back on import, so visitors see the default theme/);
    expect(notice).toHaveTextContent(
      "Your site's chosen theme “Foo Theme” was held back on import, so visitors see the default theme “Starter”. Check it under Held back on import below and restore it if you trust it.",
    );
    expect(notice.closest(".notice")).toHaveClass("warning");
  });

  it("held back on import: notice not shown when chosenThemeHeldBack is null", async () => {
    await renderReady(createFakeHeldBackThemesPort({ themes: [FOO], chosenThemeHeldBack: null }));
    expect(screen.queryByText(/was held back on import, so visitors see/)).not.toBeInTheDocument();
  });
});

describe("held back on import: wired into the Themes screen", () => {
  const SETTINGS: PresentationSettings = { workspaceId: "w1", activeThemeId: "starter", updatedAt: "2026-11-24T00:00:00.000Z" };
  const controller = (overrides: Partial<ThemesController> = {}): ThemesController => ({
    settings: SETTINGS, themes: ["starter"], themeNames: { starter: "Starter" }, error: null, busyTheme: null,
    activate: vi.fn(async () => {}), t: identity, ...overrides,
  });

  it("held back on import: Themes shows the notice at the top and the section below the grid, and a restore rescans", async () => {
    const port = createFakeHeldBackThemesPort({ themes: [FOO], chosenThemeHeldBack: { themeId: "static/foo", name: "Foo Theme", fallbackThemeId: "starter" } });
    const rescan = vi.fn(async () => {});
    const user = userEvent.setup();
    const { container } = render(
      <Themes
        useThemesHook={() => controller({ rescan })}
        useHeldBackThemesHook={({ t, onRestored }) => useHeldBackThemes({ port, t, onRestored })}
      />,
    );
    const notice = await screen.findByText(/was held back on import, so visitors see the default theme “Starter”/);
    const grid = container.querySelector(".theme-grid") as HTMLElement;
    const section = await screen.findByRole("region", { name: "Held back on import" });
    expect(notice.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(grid.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(within(section).getByRole("button", { name: "Check Foo Theme" }));
    await user.click(await within(section).findByRole("button", { name: "Restore… Foo Theme" }));
    fireEvent.click(within(screen.getByText("Restore Foo Theme?").closest("dialog") as HTMLElement).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(rescan).toHaveBeenCalledTimes(1));
  });
});

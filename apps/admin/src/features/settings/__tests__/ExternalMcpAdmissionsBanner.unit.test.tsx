import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ExternalMcpAdmissionsBanner } from "../ExternalMcpAdmissionsBanner";
import type { AdmissionDriftConnection } from "../external-mcp-admissions-rules";
import type { ExternalMcpAdmissionsController } from "../hooks/use-external-mcp-admissions.hooks";

/**
 * @file What the operator actually sees. Composed against a stub controller rather than the wired
 * hook, so these cases are about rendering decisions and not about the three network reads
 * behind them (`use-external-mcp-admissions.hooks.ts` owns those).
 *
 * `t` is the identity function here on purpose: an admin copy string IS its own i18n key
 * (`dictionary-translator.ts`), so asserting on the English text is asserting on the key. A test
 * that passed a fake translator returning a marker would stop catching a changed key, which is the
 * mistake that silently reverts a string to English in 21 locales.
 */

const IDENTITY_T = (key: string) => key;

function controller(overrides: Partial<ExternalMcpAdmissionsController> = {}): ExternalMcpAdmissionsController {
  return {
    loading: false,
    unavailable: null,
    connections: [],
    canRestart: true,
    restarting: false,
    restartError: null,
    restartAccepted: false,
    restart: () => {},
    ...overrides,
  };
}

function higgsfieldDrift(overrides: Partial<AdmissionDriftConnection> = {}): AdmissionDriftConnection {
  return {
    connectionId: "higgsfield",
    liveToolCount: 1,
    savedToolCount: 2,
    notLoaded: ["generate_image"],
    entries: [
      {
        connectionId: "higgsfield",
        remoteName: "generate_image",
        kind: "needs-write-grant",
        messageKey: "Tick 'may write' to enable this tool.",
        messageVars: {},
      },
    ],
    ...overrides,
  };
}

describe("ExternalMcpAdmissionsBanner", () => {
  it("renders nothing when the running assistant and the saved roster agree", () => {
    const { container } = render(<ExternalMcpAdmissionsBanner controller={controller()} t={IDENTITY_T} onAllowWrite={() => {}} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while the first read is still in flight, rather than flashing a false all-clear", () => {
    const { container } = render(
      <ExternalMcpAdmissionsBanner controller={controller({ loading: true })} t={IDENTITY_T} onAllowWrite={() => {}} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("says the assistant could not be asked rather than showing an empty, reassuring list", () => {
    render(
      <ExternalMcpAdmissionsBanner
        controller={controller({ unavailable: "the agent daemon is not reachable — the assistant may not be running" })}
        t={IDENTITY_T}
        onAllowWrite={() => {}}
      />,
    );

    expect(screen.getByText(/not reachable/)).toBeInTheDocument();
  });

  it("names the withheld tool, the exact fix, and the saved-vs-live counts", () => {
    render(
      <ExternalMcpAdmissionsBanner controller={controller({ connections: [higgsfieldDrift()] })} t={IDENTITY_T} onAllowWrite={() => {}} />,
    );

    expect(screen.getByText("generate_image")).toBeInTheDocument();
    expect(screen.getByText("Tick 'may write' to enable this tool.")).toBeInTheDocument();
    expect(screen.getByText("Saved. The assistant is still running with its previous tool list.")).toBeInTheDocument();
    // `{live}`/`{saved}`/`{names}` must be interpolated, not rendered as tokens.
    expect(screen.getByText("Live now: 1 tools. Saved: 2 tools — generate_image are not loaded.")).toBeInTheDocument();
  });

  it("gives the write-grant row a tick with a real accessible name, and grants that exact tool when it is clicked", async () => {
    const onAllowWrite = vi.fn();
    const user = userEvent.setup();
    render(
      <ExternalMcpAdmissionsBanner controller={controller({ connections: [higgsfieldDrift()] })} t={IDENTITY_T} onAllowWrite={onAllowWrite} />,
    );

    // By ROLE and NAME: a checkbox whose only label were `agentHandle`'s `data-agent-label` would
    // have no accessible name at all and would not be found here.
    const tick = screen.getByRole("checkbox", { name: "may write" });
    await user.click(tick);

    expect(onAllowWrite).toHaveBeenCalledExactlyOnceWith("higgsfield", "generate_image");
  });

  it("never publishes the 'may write' tick to the agent — widening a tool's access is human-only", () => {
    const { container } = render(
      <ExternalMcpAdmissionsBanner controller={controller({ connections: [higgsfieldDrift()] })} t={IDENTITY_T} onAllowWrite={() => {}} />,
    );
    expect(screen.getByRole("checkbox", { name: "may write" })).not.toHaveAttribute("data-agent-element");
    expect(container.querySelector('[data-agent-element^="mcp-drift-grant"]')).toBeNull();
  });

  it("offers no tick for a destructive refusal — there is no setting that turns one on", () => {
    render(
      <ExternalMcpAdmissionsBanner
        controller={controller({
          connections: [
            higgsfieldDrift({
              notLoaded: [],
              entries: [
                {
                  connectionId: "higgsfield",
                  remoteName: "wipe_account",
                  kind: "destructive",
                  messageKey: "The server marks this tool as destructive. Tovu does not enable destructive external tools.",
                  messageVars: {},
                },
              ],
            }),
          ],
        })}
        t={IDENTITY_T}
        onAllowWrite={() => {}}
      />,
    );

    expect(screen.getByText(/does not enable destructive external tools/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("interpolates a parameterized row's token", () => {
    render(
      <ExternalMcpAdmissionsBanner
        controller={controller({
          connections: [
            higgsfieldDrift({
              notLoaded: [],
              entries: [
                {
                  connectionId: "higgsfield",
                  remoteName: "edit_image",
                  kind: "inert-write-grant",
                  messageKey: "'{name}' is on the write list but not on the allowlist — it has no effect until it's also allowlisted.",
                  messageVars: { name: "edit_image" },
                },
              ],
            }),
          ],
        })}
        t={IDENTITY_T}
        onAllowWrite={() => {}}
      />,
    );

    expect(screen.getByText(/'edit_image' is on the write list/)).toBeInTheDocument();
  });

  it("offers the restart, and calls it once", async () => {
    const restart = vi.fn();
    const user = userEvent.setup();
    render(
      <ExternalMcpAdmissionsBanner
        controller={controller({ connections: [higgsfieldDrift()], restart })}
        t={IDENTITY_T}
        onAllowWrite={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Restart the assistant" }));

    expect(restart).toHaveBeenCalledOnce();
    expect(screen.getByText("This ends any conversation in progress.")).toBeInTheDocument();
  });

  it("hides the restart button and says who can do it when the principal lacks system.write (D-4)", () => {
    render(
      <ExternalMcpAdmissionsBanner
        controller={controller({ connections: [higgsfieldDrift()], canRestart: false })}
        t={IDENTITY_T}
        onAllowWrite={() => {}}
      />,
    );

    expect(screen.queryByRole("button", { name: "Restart the assistant" })).not.toBeInTheDocument();
    expect(screen.getByText(/don't have permission to restart the assistant/)).toBeInTheDocument();
  });

  it("reports the restart route's own refusal reason verbatim rather than a generic failure", () => {
    render(
      <ExternalMcpAdmissionsBanner
        controller={controller({ connections: [higgsfieldDrift()], restartError: "shutting down" })}
        t={IDENTITY_T}
        onAllowWrite={() => {}}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("shutting down");
  });

  it("says 'restarting', never 'restarted' — the route answers when a restart is INITIATED and no health signal exists", () => {
    render(
      <ExternalMcpAdmissionsBanner
        controller={controller({ connections: [higgsfieldDrift()], restartAccepted: true })}
        t={IDENTITY_T}
        onAllowWrite={() => {}}
      />,
    );

    expect(screen.getByText("Restarting…")).toBeInTheDocument();
    expect(screen.queryByText(/restarted/i)).not.toBeInTheDocument();
  });
});

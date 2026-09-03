import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * @file `SlowRunNoticeCard` — the inline transcript rendering of Jini's slow-run notice (a
 * `type: 'slow_running'` agent event, routed here through the `ext` renderer registry rather than
 * the pre-existing, nowhere-rendered `'status'` kind — see the component's own doc). No real
 * `@jini-ai/chat/react` component is mounted underneath it (unlike `OverflowAwareMcpUiSurfaceCard`'s
 * `McpUiSurfaceCard`), so only `useT` needs a fake here, matching that sibling test file's own
 * "identity translation" convention.
 */

vi.mock("@jini-ai/chat/react", () => ({
  useT: () => (key: string) => key,
}));

import { resolveSlowRunDetail, SlowRunNoticeCard } from "../SlowRunNoticeCard";

afterEach(() => {
  cleanup();
});

describe("resolveSlowRunDetail", () => {
  it("returns the latest event's detail text", () => {
    const events = [
      { type: "slow_running", detail: "first stall" },
      { type: "slow_running", detail: "second stall" },
    ];
    expect(resolveSlowRunDetail(events)).toBe("second stall");
  });

  it("returns undefined for an empty events array", () => {
    expect(resolveSlowRunDetail([])).toBeUndefined();
  });

  it("returns undefined when the latest entry has no detail field", () => {
    expect(resolveSlowRunDetail([{ type: "slow_running" }])).toBeUndefined();
  });

  it("returns undefined rather than trusting a non-string detail — untyped wire data, never assumed well-formed", () => {
    expect(resolveSlowRunDetail([{ type: "slow_running", detail: 12345 }])).toBeUndefined();
  });

  it("returns undefined for an empty-string detail rather than rendering a blank line", () => {
    expect(resolveSlowRunDetail([{ type: "slow_running", detail: "" }])).toBeUndefined();
  });
});

describe("SlowRunNoticeCard", () => {
  const baseProps = { name: "slow_running", runStreaming: true, runSucceeded: false, runId: "run-1" };

  it("renders the daemon-supplied detail text as a status line", () => {
    render(
      <SlowRunNoticeCard
        {...baseProps}
        events={[{ type: "slow_running", detail: "Still working — this turn is taking longer than usual." }]}
      />,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Still working — this turn is taking longer than usual.");
  });

  it("falls back to the translated default copy when the event carries no usable detail", () => {
    render(<SlowRunNoticeCard {...baseProps} events={[{ type: "slow_running" }]} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Still working — this is taking longer than usual.");
  });
});

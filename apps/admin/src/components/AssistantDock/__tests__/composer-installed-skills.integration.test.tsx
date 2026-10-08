import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer, useComposer } from "@jini-ai/chat/react";
import { useComposerCapabilities } from "../hooks/AssistantDock.hooks";
import { useComposerDiscoveryDraft } from "../hooks/composer-skills.hooks";

/** The current GET DTO, including management metadata. Keep fetch, projection, ranking and
 * Jini's actual slash filtering connected: a synthetic capability skips the failing seam. */
const skillsResponse = {
  skills: [
    {
      toolId: "skill_incident_response",
      name: "incident-response",
      description: "Use when handling production incidents, defining severity and escalation, writing runbooks, or facilitating blameless post-mortems and SLO-driven follow-up.",
      enabled: true,
      source: "uploaded",
    },
    {
      toolId: "skill_ui_ux_design",
      name: "ui-ux-design",
      description: "Use when creating frontend design systems, visual direction, component/state specs, responsive behavior, brand-aware UI guidance, premium/high-converting website polish, browser-backed UI iteration, or implementation-ready design handoff from a feature spec or existing product constraints.",
      enabled: true,
      source: "uploaded",
    },
  ],
};

function Harness() {
  const composer = useComposer();
  const { composerCapabilities } = useComposerCapabilities();
  const discovery = useComposerDiscoveryDraft(composerCapabilities.groups);
  return <div ref={discovery.rootRef} onChangeCapture={discovery.captureDraft}>
    <output data-testid="installed-ids">{JSON.stringify([...composerCapabilities.byItemId.keys()].filter(id => id.startsWith("installed-skill:")))}</output>
    <Composer composer={composer} onSend={vi.fn()} slots={{ discoveryGroups: discovery.groups }} />
  </div>;
}

afterEach(() => vi.unstubAllGlobals());

describe("installed skills from GET through the real composer slash popup", () => {
  it.each(["sk", "ui", "ux"])("preserves both enabled skills in projection and relevant labeled rows for /%s", async query => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(url).toBe("/api/admin/v1/workspaces/workspace-local/skills");
      expect(init).toEqual({
        credentials: "same-origin",
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: expect.any(AbortSignal),
      });
      return Response.json(skillsResponse);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />);
    await waitFor(() => expect(JSON.parse(screen.getByTestId("installed-ids").textContent!)).toEqual([
      "installed-skill:skill_incident_response", "installed-skill:skill_ui_ux_design",
    ]));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: `/${query}` } });
    const labels = screen.getAllByRole("option").map(option => option.querySelector("span")?.textContent);
    expect(labels).toContain("ui-ux-design · Skill");
    const skillIndex = labels.indexOf("ui-ux-design · Skill");
    expect(labels[skillIndex + 1]).toBe("UI/UX Design · Agent plugin");
    if (query === "sk") expect(labels).toContain("incident-response · Skill");
    else expect(labels.slice(0, 2)).toEqual(["ui-ux-design · Skill", "UI/UX Design · Agent plugin"]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("reloads after focus so a newly installed skill reaches an already open popup", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ skills: [] }))
      .mockImplementation(async () => Response.json(skillsResponse));
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />);
    await screen.findByRole("button", { name: "Add context" });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "/sk" } });
    expect(screen.getAllByRole("option").map(option => option.querySelector("span")?.textContent)).toEqual([
      "UI/UX Design (Agent Plugin)",
    ]);
    await act(async () => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(screen.getAllByRole("option").map(option => option.querySelector("span")?.textContent)).toEqual([
      "incident-response · Skill", "ui-ux-design · Skill", "UI/UX Design · Agent plugin",
    ]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

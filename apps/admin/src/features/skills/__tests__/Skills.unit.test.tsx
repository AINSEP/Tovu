import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Skills } from "../Skills";
import { prepareSkillUpload } from "../skill-upload";

beforeEach(() => window.history.replaceState(null, "", "/admin/skills"));
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
function skillTab(name: "Skills" | "Add a skill") {
  return within(screen.getByRole("complementary", { name: "Skills sections" })).getByRole("button", { name });
}

function emptyAddButton() {
  return within(screen.getByText("No skills installed yet").parentElement!).getByRole("button", { name: "Add a skill" });
}

describe("Skills", () => {
  it.each(["", "?tab=unknown", "?tab=skills"])("defaults to installed Skills for %s", async query => {
    window.history.replaceState(null, "", `/admin/skills${query}`);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ skills: [] })));
    render(<Skills />);
    expect(within(screen.getByRole("complementary", { name: "Skills sections" })).getAllByRole("button").map(tab => tab.textContent)).toEqual(["Skills", "Add a skill"]);
    expect(skillTab("Skills")).toHaveAttribute("aria-pressed", "true");
    await screen.findByText("No skills installed yet");
    expect(screen.queryByRole("textbox", { name: "GitHub URL" })).not.toBeInTheDocument();
    expect(emptyAddButton()).toBeEnabled();
  });

  it("opens the bookmarked Add tab and keeps install controls off the Skills tab", async () => {
    window.history.replaceState(null, "", "/admin/skills?tab=add");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ skills: [{ toolId: "skill_example", name: "example", description: "Example skill.", enabled: false, source: "uploaded" }] })));
    render(<Skills />);
    expect(skillTab("Add a skill")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "GitHub URL" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload files" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Upload folder" })).toBeEnabled();
    expect(screen.queryByRole("list", { name: "Installed skills" })).not.toBeInTheDocument();
    await userEvent.click(skillTab("Skills"));
    expect(window.location.pathname + window.location.search).toBe("/admin/skills?tab=skills");
    await screen.findByRole("list", { name: "Installed skills" });
    expect(screen.queryByRole("textbox", { name: "GitHub URL" })).not.toBeInTheDocument();
  });

  it("switches from the empty-state button and tabs without growing history, preserving the URL draft", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ skills: [] })));
    const user = userEvent.setup();
    render(<Skills />);
    await screen.findByText("No skills installed yet");
    const historyLength = window.history.length;
    await user.click(emptyAddButton());
    expect(window.location.pathname + window.location.search).toBe("/admin/skills?tab=add");
    await user.type(screen.getByRole("textbox", { name: "GitHub URL" }), "https://github.com/acme/incident");
    await user.click(skillTab("Skills"));
    expect(skillTab("Skills")).toHaveAttribute("aria-pressed", "true");
    await user.click(skillTab("Add a skill"));
    expect(screen.getByRole("textbox", { name: "GitHub URL" })).toHaveValue("https://github.com/acme/incident");
    expect(window.history.length).toBe(historyLength);
  });
  it.each(["eye", "name"])("opens the read-only viewer from the %s and selects SKILL.md first", async trigger => {
    const base = "/api/admin/v1/workspaces/workspace-local/skills";
    const fetchMock = vi.fn(async (url, init) => {
      expect(init?.method).toBeUndefined();
      expect(init?.credentials).toBe("same-origin");
      if (url === base) return Response.json({ skills: [{ toolId: "skill_example", name: "example", description: "Example skill.", enabled: false, source: "uploaded" }] });
      expect(url).toBe(`${base}/skill_example/files`);
      return Response.json({ toolId: "skill_example", truncated: false, files: [
        { relativePath: "README.md", content: "Read me", sizeBytes: 7, omitted: null },
        { relativePath: "SKILL.md", content: "Follow these skill instructions.", sizeBytes: 31, omitted: null },
      ] });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Skills />);
    await screen.findByText("example");
    fireEvent.click(screen.getByRole("button", { name: trigger === "eye" ? "Inspect skill files — example" : "example" }));
    await screen.findByRole("dialog", { name: "example skill files preview" });
    await screen.findByText("Follow these skill instructions.");
    expect(screen.getByRole("treeitem", { name: "SKILL.md" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("treeitem", { name: "README.md" }).getAttribute("aria-selected")).toBe("false");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("lists real skills, disables and removes via the shared workspace API", async () => {
    let installed = [{ toolId: "skill_incident_response", name: "incident-response", description: "Respond to outages.", enabled: true, source: "uploaded" }];
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      const base = "/api/admin/v1/workspaces/workspace-local/skills";
      if (url === base && !init?.method) return Response.json({ skills: installed });
      expect(url).toBe(`${base}/skill_incident_response`);
      if (init?.method === "PATCH") { expect(JSON.parse(init.body)).toEqual({ enabled: false }); installed = installed.map(s => ({ ...s, enabled: false })); return Response.json({ updated: true }); }
      if (init?.method === "DELETE") { installed = []; return Response.json({ removed: true }); }
      throw new Error(`Unexpected request: ${init?.method} ${url}`);
    }));
    render(<Skills />);
    await screen.findByText("incident-response");
    fireEvent.click(screen.getByRole("switch", { name: "Enable incident-response" }));
    await waitFor(() => expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false"));
    const remove = screen.getByRole("button", { name: "Remove incident-response" });
    expect(remove).toHaveClass("agent-plugin-icon-btn");
    expect(remove.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(remove.querySelectorAll("svg path")[2]).toHaveAttribute("d", "M10.4 10.5v6M13.6 10.5v6");
    expect(remove).not.toHaveTextContent("Remove");
    await userEvent.click(remove);
    expect(screen.getByRole("dialog", { name: "Remove skill" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Remove skill" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Installed skills" })).toHaveTextContent("incident-response");
    await userEvent.click(remove);
    await userEvent.click(screen.getByRole("button", { name: "Confirm remove" }));
    await screen.findByText("No skills installed yet");
  });
  it("GitHub add requires confirmation, installs, and refreshes the list", async () => {
    let installed: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      expect(url).toBe("/api/admin/v1/workspaces/workspace-local/skills");
      if (init?.method === "POST") { expect(JSON.parse(init.body)).toEqual({ githubUrl: "https://github.com/acme/incident", confirmed: true }); installed = [{ toolId: "skill_incident_response", name: "incident-response", description: "Outages.", enabled: true, source: { githubUrl: "https://github.com/acme/incident", commit: "a".repeat(40) } }]; return Response.json({ skill: installed[0] }); }
      return Response.json({ skills: installed });
    }));
    render(<Skills />);
    await screen.findByText("No skills installed yet");
    await userEvent.click(skillTab("Add a skill"));
    fireEvent.change(screen.getByRole("textbox", { name: "GitHub URL" }), { target: { value: "https://github.com/acme/incident" } });
    fireEvent.click(screen.getByRole("button", { name: "Add from GitHub" }));
    expect(screen.getByRole("dialog", { name: "Install skill" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm install" }));
    await screen.findByText("incident-response");
    expect(skillTab("Skills")).toHaveAttribute("aria-pressed", "true");
    expect(window.location.pathname + window.location.search).toBe("/admin/skills?tab=skills");
    expect(screen.queryByRole("textbox", { name: "GitHub URL" })).not.toBeInTheDocument();
  });
  it.each(["files", "folder"])("%s picker uploads SKILL.md after confirmation and returns to Skills", async picker => {
    const md = "---\nname: picked-skill\ndescription: Picked skill.\n---\nRules.";
    const requests: unknown[] = [];
    let installed: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      expect(url).toBe("/api/admin/v1/workspaces/workspace-local/skills");
      if (init?.method === "POST") {
        requests.push(JSON.parse(init.body));
        installed = [{ toolId: "skill_picked_skill", name: "picked-skill", description: "Picked skill.", enabled: true, source: "uploaded" }];
        return Response.json({ skill: installed[0] });
      }
      return Response.json({ skills: installed });
    }));
    render(<Skills />);
    await userEvent.click(skillTab("Add a skill"));
    fireEvent.change(screen.getByLabelText(`Choose skill ${picker}`), { target: { files: [new File([md], "SKILL.md")] } });
    await screen.findByRole("dialog", { name: "Install skill" });
    expect(requests).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Confirm install" }));
    await waitFor(() => expect(requests).toEqual([{ confirmed: true, files: [{ path: "SKILL.md", contentBase64: btoa(md) }] }]));
    await waitFor(() => expect(skillTab("Skills")).toHaveAttribute("aria-pressed", "true"));
    expect(window.location.search).toBe("?tab=skills");
    expect(screen.getByRole("list", { name: "Installed skills" })).toHaveTextContent("picked-skill");
  });

  it("stays on Add after an install failure, then switches only after a successful retry", async () => {
    window.history.replaceState(null, "", "/admin/skills?tab=add");
    let attempts = 0;
    let installed: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      expect(url).toBe("/api/admin/v1/workspaces/workspace-local/skills");
      if (init?.method === "POST") {
        if (++attempts === 1) return Response.json({ error: "Skill source unavailable" }, { status: 400 });
        installed = [{ toolId: "skill_retry", name: "retry", description: "Retry skill.", enabled: true, source: "uploaded" }];
        return Response.json({ skill: installed[0] });
      }
      return Response.json({ skills: installed });
    }));
    const user = userEvent.setup();
    render(<Skills />);
    await user.type(screen.getByRole("textbox", { name: "GitHub URL" }), "https://github.com/acme/retry");
    await user.click(screen.getByRole("button", { name: "Add from GitHub" }));
    await user.click(screen.getByRole("button", { name: "Confirm install" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Skill source unavailable");
    expect(skillTab("Add a skill")).toHaveAttribute("aria-pressed", "true");
    expect(window.location.search).toBe("?tab=add");
    await user.click(screen.getByRole("button", { name: "Confirm install" }));
    expect(await screen.findByRole("list", { name: "Installed skills" })).toHaveTextContent("retry");
    expect(skillTab("Skills")).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps disabled rows, details, and GitHub provenance on the installed tab", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ skills: [{ toolId: "skill_example", name: "example", description: "All the instructions.", enabled: false, source: { githubUrl: "https://github.com/acme/skill", commit: "abcdef123456789" } }] })));
    render(<Skills />);
    const row = await screen.findByRole("listitem", { name: "example" });
    expect(within(row).getByRole("switch", { name: "Enable example" })).toHaveAttribute("aria-checked", "false");
    expect(within(row).getByRole("link", { name: "GitHub" })).toHaveAttribute("href", "https://github.com/acme/skill");
    expect(within(row).getByText("abcdef1")).toBeInTheDocument();
    const expander = within(row).getByRole("button", { name: "Show or hide details — example" });
    await userEvent.click(expander);
    expect(expander).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(expander.getAttribute("aria-controls")!)).not.toHaveAttribute("hidden");
  });
});
it("folder and ZIP picker inputs retain all package paths and original bytes", async () => {
  const md = new File(["rules"], "SKILL.md");
  Object.defineProperty(md, "webkitRelativePath", { value: "my-skill/SKILL.md" });
  const ref = new File(["reference"], "check.md");
  Object.defineProperty(ref, "webkitRelativePath", { value: "my-skill/references/check.md" });
  expect(await prepareSkillUpload([md, ref])).toEqual({ files: [{ path: "my-skill/SKILL.md", contentBase64: btoa("rules") }, { path: "my-skill/references/check.md", contentBase64: btoa("reference") }] });
  expect(await prepareSkillUpload([new File(["zip bytes"], "skill.zip")])).toEqual({ archiveBase64: btoa("zip bytes") });
});


it("Jini-expanded chat folder paths survive skill upload preparation", async () => {
  const md = Object.assign(new File(["rules"], "SKILL.md"), { relativePath: "incident/SKILL.md" });
  const ref = Object.assign(new File(["reference"], "check.md"), { relativePath: "incident/references/check.md" });
  expect(await prepareSkillUpload([md, ref])).toEqual({ files: [{ path: "incident/SKILL.md", contentBase64: btoa("rules") }, { path: "incident/references/check.md", contentBase64: btoa("reference") }] });
});

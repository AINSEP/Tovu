import { act, cleanup, render, screen, within } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ADMIN_LOCALES } from "@/lib/settings-tabs";
import { Skills } from "../Skills";
import { useSkills } from "../use-skills.hooks";
import { t } from "../skills-i18n";
import type { InstalledSkill } from "../api";

afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });
const locales = ADMIN_LOCALES.filter(({ code }) => code !== "en").map(({ code }) => code);
const skill: InstalledSkill = { toolId: "skill_example", name: "example", description: "User-authored description", enabled: true, source: "uploaded" };

it.each(locales)("%s translates loading, empty and add surfaces from the locale picker", async locale => {
  window.history.replaceState(null, "", "/admin/addons/skills");
  let resolve!: (value: InstalledSkill[]) => void;
  // The production query adapter starts reads asynchronously, after render returns.
  const pending = new Promise<InstalledSkill[]>(yes => { resolve = yes; });
  const port = { listSkills: () => pending, enableSkill: vi.fn(), removeSkill: vi.fn() };
  const tr = (key: string) => t({ locale, key });
  render(<Skills useLocaleHook={() => locale} useSkillsHook={options => useSkills({ ...options, port })} />);
  expect(screen.getByRole("status")).toHaveTextContent(tr("Loading skills…"));
  expect(tr("Loading skills…")).not.toBe("Loading skills…");
  await act(async () => resolve([]));
  expect(await screen.findByText(tr("No skills installed yet"))).toBeInTheDocument();
  const navigation = screen.getByRole("complementary", { name: tr("Skills sections") });
  await userEvent.click(within(navigation).getByRole("button", { name: tr("Add a skill") }));
  for (const key of ["Upload files", "Upload folder", "Add from GitHub"]) {
    expect(tr(key)).not.toBe(key);
    expect(screen.getByRole("button", { name: tr(key) })).toBeInTheDocument();
  }
  expect(screen.getByLabelText(tr("Choose skill files"))).toBeInTheDocument();
  expect(screen.getByLabelText(tr("Choose skill folder"))).toBeInTheDocument();
});

it.each(locales)("%s translates rows, removal and fallback details while preserving skill content", async locale => {
  window.history.replaceState(null, "", "/admin/addons/skills");
  const port = { listSkills: async () => [skill], enableSkill: vi.fn(), removeSkill: async () => { throw null; } };
  const tr = (key: string) => t({ locale, key });
  render(<Skills useLocaleHook={() => locale} useSkillsHook={options => useSkills({ ...options, port })} />);
  const list = await screen.findByRole("list", { name: tr("Installed skills") });
  expect(list).toHaveTextContent(skill.description);
  expect(list).toHaveTextContent(tr("Uploaded"));
  expect(list).toHaveTextContent(tr("Enabled"));
  expect(screen.getByRole("switch", { name: tr("Enable {name}").replace("{name}", skill.name) })).toBeChecked();
  await userEvent.click(screen.getByRole("button", { name: tr("Remove {name}").replace("{name}", skill.name) }));
  const dialog = screen.getByRole("dialog", { name: tr("Remove skill") });
  expect(within(dialog).getByRole("heading")).toHaveTextContent(tr("Remove {name}?").replace("{name}", skill.name));
  await userEvent.click(within(dialog).getByRole("button", { name: tr("Confirm remove") }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(tr("Could not change skill."));
  expect(within(dialog).getByRole("button", { name: tr("Copy details") })).toBeInTheDocument();
  expect(screen.getByRole("list", { name: tr("Installed skills") })).toHaveTextContent(skill.name);
});

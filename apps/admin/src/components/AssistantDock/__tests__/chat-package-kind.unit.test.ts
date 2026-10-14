import { expect, it } from "vitest";
import { chatPackageKind, partitionChatPackages } from "../hooks/chat-package-kind";
import { zipFolderFiles } from "../../InstallTabCard/folder-zip";

async function archive(paths: string[]) {
  const files = paths.map(path => {
    const file = new File(["manifest"], path.split("/").at(-1)!);
    Object.defineProperty(file, "webkitRelativePath", { value: `chosen/${path}` });
    return file;
  });
  return zipFolderFiles({ files, maxBytes: 1024 * 1024 });
}

it.each([[["SKILL.md"], "skill"], [["wrapped/SKILL.md"], "skill"], [["one/two/SKILL.md"], "attachment"],
  [["plugin.json", "SKILL.md"], "agent-plugin"], [["tovu.plugin.json", "SKILL.md"], "site-plugin"],
  [["wrapped/plugin.json"], "agent-plugin"], [["wrapped/tovu.plugin.json"], "site-plugin"], [["README.md"], "attachment"],
  [["jini.plugin.json", "SKILL.md"], "site-plugin"], [["wrapped/jini.plugin.json"], "site-plugin"],
  [["jini.plugin.json", "tovu.plugin.json", "plugin.json", "SKILL.md"], "site-plugin"], // legacy alias
  [["one/two/jini.plugin.json"], "attachment"], [["__MACOSX/jini.plugin.json"], "attachment"],
] as const)("classifies %j from central-directory names as %s", async (paths, kind) => {
  expect(await chatPackageKind({ file: await archive([...paths]) })).toBe(kind);
});

it.each(["jini.plugin.json", "tovu.plugin.json"])("keeps %s folders and bundled skills together as attachments", async (filename) => { // legacy alias
  const files = [filename, "SKILL.md", "skills/help/SKILL.md"].map(relative =>
    Object.assign(new File(["content"], relative.split("/").at(-1)!), { relativePath: `plugin/${relative}` }));
  expect(await partitionChatPackages({ files })).toEqual({ skills: [], attachments: files });
});

it("routes truncated central directories to chat", async () => {
  const file = await archive(["SKILL.md"]);
  expect(await chatPackageKind({ file: new File([file.slice(0, file.size - 1)], "broken.zip") })).toBe("attachment");
});
